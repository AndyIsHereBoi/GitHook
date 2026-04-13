var express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const config = require("./config.json");
const { 
    loginRequiredMiddleware,
    createSession,
    fetchUser,
    verifyCaptchaMiddleware,
    createUser,
    checkValidEmail,
    sendResetEmail,
    checkUserExistsByNumber,
    checkUserExistsByEmail,
    fetchHook,
    newHook,
    queryDB,
    fetchAllHooks,
} = require('./functions');
const app = express();

const requestTimeoutMs = Number(config.requestTimeoutMs) || 15000;

function wantsJson(req) {
    const acceptHeader = String(req.headers.accept || "").toLowerCase();
    return req.path.startsWith("/api/") || acceptHeader.includes("application/json") || req.xhr;
}

function sendErrorResponse(req, res, statusCode, message) {
    if(res.headersSent) {
        return;
    }

    if(wantsJson(req)) {
        return res.status(statusCode).json({
            "success": false,
            "error": message
        });
    }

    return res.status(statusCode).render("error", {
        statusCode: statusCode,
        message: message
    });
}

function wrapAsyncHandler(handler) {
    if(typeof handler !== "function" || handler.length > 3) {
        return handler;
    }

    return function (req, res, next) {
        return Promise.resolve(handler(req, res, next)).catch(next);
    };
}

["get", "post", "put", "patch", "delete"].forEach((method) => {
    const originalMethod = app[method].bind(app);
    app[method] = function (path, ...handlers) {
        const wrappedHandlers = handlers.map((handler) => wrapAsyncHandler(handler));
        return originalMethod(path, ...wrappedHandlers);
    };
});


process.on('uncaughtException', function (error) {
    console.log(error.stack);
});

process.on('unhandledRejection', function (reason) {
    console.log('UnhandledPromiseRejection:', reason);
});

// events

app.listen(config.port, function() {    
    console.log('Express server listening on 0.0.0.0:' + config.port);
});

app.disable('x-powered-by');
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");
app.use('/assets', express.static('assets'));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(config.cookieSecret));
app.use(express.json())
app.use((req, res, next) => {
    res.setTimeout(requestTimeoutMs, () => {
        console.log("request timeout", req.method, req.originalUrl);
        sendErrorResponse(req, res, 504, "Request timed out while waiting for the backend.");
    });
    return next();
});

app.get("/", async (req, res) => {
    res.redirect("/dashboard/account");
});

app.get("/login", async (req, res) => {
    res.render("login", {
        recaptchaKey: config.recaptcha ? config.recaptcha.siteKey : "",
        captchaEnabled: !!(config.recaptcha && config.recaptcha.enabled)
    });
});

app.get("/register", async (req, res) => {
    res.render("register", {
        recaptchaKey: config.recaptcha ? config.recaptcha.siteKey : "",
        captchaEnabled: !!(config.recaptcha && config.recaptcha.enabled)
    });
}); 

app.get("/forgot-password", async (req, res) => {
    res.render("forgot-password", {
        recaptchaKey: config.recaptcha ? config.recaptcha.siteKey : "",
        captchaEnabled: !!(config.recaptcha && config.recaptcha.enabled)
    });
});

app.post("/login", verifyCaptchaMiddleware, async (req, res) => {
    const email = req.body.email;
    const password = req.body.password;
    const session = await createSession(email, password);
    if(session.success) {
        res.cookie('login', `${session.cookie.cookie}`, { signed: true });
        if(req.query.path) {
            return res.redirect(req.query.path);
        } else {
            return res.redirect("/dashboard/account");
        };
    } else return res.json({
        "success": false
    });
});

app.post("/register", verifyCaptchaMiddleware, async (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    const email = req.body.email;
    if(username.length < 3 || username.length > 18) return res.redirect("/register?error=Username must be at least 3 characters long, and less then 18 total.");
    if(password.length < 8 || password.length > 32) return res.redirect("/register?error=Password must be at least 8 characters long, and less then 32 total.");
    if(!checkValidEmail(email)) return res.redirect("/register?error=Invalid email.");
    const newUser = await createUser(username, email, password);
    if(!newUser.success) return res.redirect("/register?error=An error occured while creating your account. Please try again later.");
    const session = await createSession(email, password);
    if(session.success) {
        res.cookie('login', `${session.cookie.cookie}`, { signed: true });
        return res.redirect("/dashboard/account");
    } else return res.json({
        "success": false
    });
});

app.post("/forgot-password", verifyCaptchaMiddleware, async (req, res) => {
    const email = req.body.email;
    if(!email) { return res.redirect("/forgot-password?error=Please enter your email address."); };
    const emailValid = await checkValidEmail(email);
    if(!emailValid) { return res.redirect("/forgot-password?error=Invalid email address."); };
    const user = await checkUserExistsByEmail(email);
    if(user) {
        sendResetEmail(email);
    } else {
        return res.redirect("/forgot-password?error=No account with that email address exists.");
    };
});

async function renderDashboard(req, res) {
    const user = await fetchUser(req);
    return res.render("dashboard", {
        user: user,
        initialRoute: req.path,
        publicDomain: config.publicDomain || ""
    });
}

app.get("/dashboard/account", loginRequiredMiddleware, async (req, res) => {
    return renderDashboard(req, res);
});

app.get("/dashboard/links", loginRequiredMiddleware, async (req, res) => {
    return renderDashboard(req, res);
});

app.get("/dashboard/status", loginRequiredMiddleware, async (req, res) => {
    return renderDashboard(req, res);
});

app.get("/dashboard/hook/:hookId", loginRequiredMiddleware, async (req, res) => {
    const hookId = req.params.hookId;
    const hookData = await fetchHook(hookId);
    const user = await fetchUser(req);
    if(!hookData) { return res.status(404).json({ "success": false, "error": "Not found" }); }
    
    if(user.usernumber !== hookData.ownerNumber) { return res.status(401).json({ "success": false, "error": "Unauthorized" }); };
    return renderDashboard(req, res);
});

app.get("/dashboard", loginRequiredMiddleware, async (req, res) => {
    return res.redirect("/dashboard/account");
});


app.post("/dashboard/newhook", loginRequiredMiddleware, async (req, res) => {
    const user = await fetchUser(req);
    const hook = await newHook(user.usernumber);
    if(!hook.success) return res.json({ "success": false });
    return res.json({
        "success": true,
        "hook": hook.hookId
    });
});


app.post("/hook/:ID", async (req, res) => {
    const hookId = req.params.ID;
    const hookData = await fetchHook(hookId);
    if(!hookData) {
        return res.status(404).json({
            "success": false,
            "error": "Hook not found"
        });
    }
    await axios({
        method: hookData.requestMethod,
        url: hookData.requestUrl,
        data: JSON.parse(hookData.requestBody),
        headers: JSON.parse(hookData.requestHeaders)
    }).then(async (response) => {
        if(`${response.status}`.startsWith("2")) {
            queryDB("UPDATE hooks SET timesRan = timesRan + 1 WHERE hookId = ?", [hookId]);
            console.log("SUCCESS response.status", response.status);
            return res.json({
                "success": true
            });
        } else {
            queryDB("UPDATE hooks SET timesFailed = timesFailed + 1 WHERE hookId = ?", [hookId]);
        };
    }).catch(function (error) {
        console.log("ERROR ", error);
        queryDB("UPDATE hooks SET timesFailed = timesFailed + 1 WHERE hookId = ?", [hookId]);
        return res.json({
            "success": false
        });
    });
});



/*

AFTER THIS IS ALL API ENDPOINTS

*/



app.get("/api/gethook/:hookId", loginRequiredMiddleware, async (req, res) => {
    const hookId = req.params.hookId;
    const user = await fetchUser(req);
    const hookData = await fetchHook(hookId);
    if(!hookData) { return res.status(404).json({ "success": false, "error": "Not found" }); }
    
    if(user.usernumber !== hookData.ownerNumber) { return res.status(401).json({ "success": false, "error": "Unauthorized" }); };
    return res.json(hookData);
});

app.get("/api/me", loginRequiredMiddleware, async (req, res) => {
    const user = await fetchUser(req);
    return res.json({
        usernumber: user.usernumber,
        username: user.username,
        email: user.email
    });
});


app.post("/api/updatehook/:hookId", loginRequiredMiddleware, async (req, res) => {
    const user = await fetchUser(req);
    const hook = await fetchHook(req.params.hookId);
    if(!hook) { return res.status(404).json({ "success": false, "error": "Not found" }); }
    if(user.usernumber !== hook.ownerNumber) { return res.status(401).json({ "success": false, "error": "Unauthorized" }); };

    try {
        const requestHeaders = JSON.stringify(req.body.headers);
        const requestBody = JSON.stringify(req.body.body);
        let hookId = req.params.hookId;
        let requestMethod = req.body.method.toLowerCase();
        let customName = req.body.customName;
        const requestUrl = req.body.sendToUrl; 

        if (requestMethod !== 'post' && requestMethod !== 'get' && requestMethod !== 'patch' && requestMethod !== 'delete') {
            requestMethod = 'post';
        }
        customName = String(customName).substring(0, 50);
        const urlRegex = /^(http|https):\/\/[^ \r\n\t\f]{1,100}$/igm;
        const sanitizedUrl = requestUrl.match(urlRegex);
        const uuidRegex = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[1-5][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$/igm;
        if(!hookId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[4][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)){
            console.log("invalid hook id,", hookId);
            return res.json({
                "success": false
            });
        };
        
        const query = await queryDB("UPDATE `hooks` SET `requestHeaders` = ?, `requestBody` = ?, `requestMethod` = ?, `customName` = ?, `requestUrl` = ?, lastEditedAt = ? WHERE hookId = ?", [requestHeaders, requestBody, requestMethod, customName, sanitizedUrl, Date.now(), hookId]);
        
        if(query.affectedRows > 0) {
            return res.json({
                "success": true
            });
        } else {
            console.log("no rows affected")
            return res.json({
                "success": false
            });
        };
    } catch (error) {
        console.log("ERROR", error);
        return res.json({
            "success": false
        });
    };

});


app.get("/api/getallhooks", loginRequiredMiddleware, async (req, res) => {
    const user = await fetchUser(req);
    const allHooks = await fetchAllHooks(user.usernumber);
    
    return res.json(allHooks);
});

app.post("/api/deletehook/:hookId", loginRequiredMiddleware, async (req, res) => {
    const hookId = req.params.hookId;
    const user = await fetchUser(req);
    const hook = await fetchHook(hookId);

    if(!hook) {
        return res.status(404).json({
            "success": false,
            "error": "Not found"
        });
    }

    if(user.usernumber !== hook.ownerNumber) {
        return res.status(401).json({
            "success": false,
            "error": "Unauthorized"
        });
    }

    const result = await queryDB("DELETE FROM hooks WHERE hookId = ? AND ownerNumber = ?", [hookId, user.usernumber]);
    return res.json({
        "success": result.affectedRows > 0
    });
});

app.use((req, res) => {
    return sendErrorResponse(req, res, 404, "Page not found.");
});

app.use((error, req, res, next) => {
    console.log("request error", error);
    return sendErrorResponse(req, res, 500, "An unexpected server error occurred.");
});
