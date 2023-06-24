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
    getHooks,
} = require('./functions');
const app = express();


process.on('uncaughtException', function (error) {
    console.log(error.stack);
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

app.get("/", async (req, res) => {
    res.redirect("/dashboard/account");
});

app.get("/login", async (req, res) => {
    res.render("login", {
        recaptchaKey: config.recaptcha.siteKey
    });
});

app.get("/register", async (req, res) => {
    res.render("register", {
        recaptchaKey: config.recaptcha.siteKey
    });
}); 

app.get("/forgot-password", async (req, res) => {
    res.render("forgot-password", {
        recaptchaKey: config.recaptcha.siteKey
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
            return res.redirect("/dashboard/home");
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
        return res.redirect("/dashboard/home");
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

app.get("/dashboard/account", loginRequiredMiddleware, async (req, res) => {
    const user = await fetchUser(req);
    return res.render("dashboard_account", {
        user: user
    });
});

app.get("/dashboard/links", loginRequiredMiddleware, async (req, res) => {
    const user = await fetchUser(req);
    const hooks = await getHooks(user.usernumber);
    return res.render("dashboard_links", {
        user: user,
        hookList: hooks
    });
});

app.post("dashboard/updateurl", loginRequiredMiddleware, async (req, res) => {
    const user = await fetchUser(req);
    return res.render("dashboard_home", {
        user: user
    });
});

app.get("/dashboard/hook/:hookId", loginRequiredMiddleware, async (req, res) => {
    // const hookId = req.params.hookId;
    // const hookData = await fetchHook(hookId);
    return res.render("dashboard_hook")
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

app.post("/dashboard/hook/:hookId", loginRequiredMiddleware, async (req, res) => {
    const user = await fetchUser(req);
    const hook = await fetchHook(req.params.hookId);
    if(!user.usernumber == hook.ownerNumber) { return res.status(401).json({ "success": false, "error": "Unauthorized" });};

    try {
        const requestHeaders = JSON.stringify(req.body.requestHeaders);
        const requestBody = JSON.stringify(req.body.requestBody);

        let hookId = req.params.hookId;
        let requestMethod = req.body.method.toLowerCase();
        let customName = req.body.customName;
        const requestUrl = req.body.sendToUrl; 

        console.log("requestBody", req.body);
        if (requestMethod !== 'post' && requestMethod !== 'get' && requestMethod !== 'patch' && requestMethod !== 'delete') {
            requestMethod = 'post';
        }
        customName = String(customName).substring(0, 50);
        const urlRegex = /^(http|https):\/\/[^ \r\n\t\f]{1,100}$/igm;
        const sanitizedUrl = requestUrl.match(urlRegex);
        const uuidRegex = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[1-5][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$/igm;
        if(!uuidRegex.test(hookId)){
            hookId = '';
        }
        
        const query = await queryDB("UPDATE `hooks` SET `requestHeaders` = ?, `requestBody` = ?, `requestMethod` = ?, `customName` = ?, `requestUrl` = ? WHERE `hookId` = ?", [requestHeaders, requestBody, requestMethod, customName, sanitizedUrl, hookId]);
        
        if(query.affectedRows > 0) {
            return res.json({
                "success": true
            });
        } else {
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


app.post("/hook/:ID", async (req, res) => {
    const hookId = req.params.ID;
    const hookData = await fetchHook(hookId);
    if(!hookData) return;
    console.log("hookData", hookData)
    console.log(`method: ${hookData.requestMethod},
        url: ${hookData.requestUrl},
        data: ${JSON.parse(hookData.requestBody)},
        headers: ${JSON.parse(hookData.requestHeaders)}`)
    await axios({
        method: hookData.requestMethod,
        url: hookData.requestUrl,
        data: JSON.parse(hookData.requestBody),
        headers: JSON.parse(hookData.requestHeaders)
    }).then(async (response) => {
        if(`${response.status}`.startsWith("2")) {
            console.log("SUCCESS response.status", response.status);
            return res.json({
                "success": true
            });
        };
    }).catch(async (error) => {
        console.log("ERROR ", error);
        return res.json({
            "success": false
        });
    });
});