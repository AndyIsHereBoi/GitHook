const config = require('./config.json');
const mysql = require('mysql');
const { uuid } = require('uuidv4');
const bcrypt = require ("bcrypt");
const Recaptcha = require('google-recaptcha');
const recaptcha = new Recaptcha({secret: config.recaptcha.secretKey});
const mailer = require('nodemailer');
const smtpTransport = require('nodemailer-smtp-transport');
const transporter = mailer.createTransport(smtpTransport(config.email));

async function sendEmail(to, subject, content) {
    const mailOptions = {
        from: config.email.user,
        to: to,
        subject: subject,
        html: content
    };
    transporter.sendMail(mailOptions, function(error, info){
        if (error) {
            console.log("mailsend error", error);
            return false;
        } else {
            console.log('Email sent: ' + info.response);
        };
    });
};






async function queryDB(query, value) {
    return new Promise(async (resolve, reject) => {
        var con = mysql.createConnection(config.db);
        if (!value) {
            con.query(query, async (err, result) => {
                if (err) return reject(err.message);
                resolve(result)
                con.destroy();
            });
        } else {
            con.query(query, value, async (err, result) => {
                if (err) return reject(err.message);
                resolve(result)
                con.destroy();
            });
        };
    });
};


function getDate() {
    const date_ob = new Date();
    let dateE = ("0" + date_ob.getDate()).slice(-2);
    let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
    let year = date_ob.getFullYear();
    let hours = date_ob.getHours();
    let minutes = date_ob.getMinutes();
    let seconds = date_ob.getSeconds();
    var DateStuff = `${month}/${dateE}/${year} ${hours}:${minutes}:${seconds}`;
    return DateStuff;
};


async function hashPassword(password) {
    return new Promise(async (resolve, reject) => {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        resolve(hashedPassword);
    });
};



async function randomString(len) {
    return Math.random().toString(36).substring(2,len+2);
};


async function newCookie(userNumber) {
    const cookie = await randomString(32)
    var queryResults = await queryDB('INSERT INTO cookies (usernumber, cookie) VALUES (?, ?);', [ userNumber, cookie ]);
    return {
        "cookie": `${cookie}`
    };
}


async function createSession(email, password) {
    if(!email || !password) {
        resolve({
            "success": false
        });
    };

    var queryResults = await queryDB('SELECT * FROM users WHERE email = ?;', [ email ]);
    var correctHashedPassword = queryResults[0]['password'];
    if (!bcrypt.compare(password, correctHashedPassword)) {
        return {
            "correct": false
        };
    }


    const userNumber = queryResults[0].usernumber;
    const cookie = await newCookie(userNumber);
    return {
        "success": true,
        "cookie": cookie
    };
};


async function checkUserExistsByNumber(userNumber) {
    const query = await queryDB("SELECT * FROM users WHERE usernumber = ?;", [ userNumber ]);
    if(!query[0]) {
        return false;
    } else if(query[0].username) {
        return true;
    } else {
        return false;
    };
};


async function checkUserExistsByEmail(userEmail) {
    const query = await queryDB("SELECT * FROM users WHERE email = ?;", [ userEmail ]);
    if(!query[0]) {
        return false;
    } else if(query[0].email) {
        return true;
    } else {
        return false;
    };
};


async function loginRequiredMiddleware(req, res, next) {
    const cookies = JSON.parse(JSON.stringify(req.signedCookies));
    if(!cookies.login) return res.redirect(`/login?path=${req.path}&message=You have been logged out. Please log in again.`);
    const query = await queryDB("SELECT * FROM cookies WHERE cookie = ?;",  [ cookies.login ]);
    if(!query[0]) return res.redirect(`/login?path=${req.path}&message=You have been logged out. Please log in again.`);
    if(await checkUserExistsByNumber(query[0].usernumber)) {

        return next();
    } else {
        return res.redirect(`/login?path=${req.path}&message=You have been logged out. Please log in again.`)
    }
};



async function fetchUser(req) {
    const cookie = JSON.parse(JSON.stringify(req.signedCookies)).login;
    const query = await queryDB("SELECT * FROM cookies WHERE cookie = ?;",  [ cookie ]);
    const user = await queryDB("SELECT * FROM users WHERE usernumber = ?;",  [ query[0].usernumber ]);
    if(user[0]) {
        return user[0];
    } else {
        return false;
    };
};


async function verifyCaptchaMiddleware(req, res, next) {
    var invalidRedirectUrl;
    console.log("req.path", req.path)
    if(req.query.path) {
        invalidRedirectUrl = `/${req.path}?error=Invalid Captcha&path=${req.query.path}`;
        console.log("invalidRedirectUrl", invalidRedirectUrl)
    } else {
        invalidRedirectUrl = `/${req.path}`
    };
    const gResponse = req.body['g-recaptcha-response'];
    if(!gResponse) {
        console.log("no gResponse")
        return res.redirect(invalidRedirectUrl)
    };
    recaptcha.verify({response: gResponse}, (error) => {
        if (error) {
            console.log("error", error)
            return res.redirect(invalidRedirectUrl)
        };
    });
    return next();
};


async function createUser(username, email, password) {
    const hashedPassword = await hashPassword(password);
    const query = await queryDB("INSERT INTO users (username, email, password) VALUES (?, ?, ?);", [ username, email, hashedPassword ]);
    if(query.affectedRows >= 1) {
        return {
            "success": true,
        };
    } else {
        return {
            "success": false,
        };
    }
};


async function checkValidEmail(email) {
    let regex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (email.match(regex)) {
        return true;
    } else {
        return false;
    };
};


async function sendResetEmail(email) {
    const response = await sendEmail(email, `GitHook Password Reset", "Click the link below to reset your password: https://${config.publicDomain}/resetpassword` + email);
    console.log("reset email response", response);
};


async function fetchHook(hookId) {
    const query = await queryDB("SELECT * FROM hooks WHERE hookId = ?;",  [ hookId ]);
    if(query[0]) {
        return query[0];
    } else {
        return false;
    };
};


async function newHook(userId) {
    const uuid = uuid();
    const query = await queryDB("INSERT INTO hooks (hookId, ownerNumber, timesRan, timesFailed, requestHeaders, requestBody, requestMethod, lastRanAt, lastEditedAt, customName, requestUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [uuid, userId, "0", "0", "{}", {}, "post", "0", "0", "Rename me!", "https://some-url..."]);
    if(query[0].affectedRows >= 1) {
        return {
            "success": true,
            "hookId": uuid
        };
    } else {
        return {
            "success": false
        };
    };
};


async function getHooks(userId) {
    const query = await queryDB("SELECT hookId, customName, timesRan, lastEditedAt FROM hooks WHERE ownerNumber = ?;",  [ userId ]);
    if(query[0]) {
        var finalHooks = [];
        query.forEach((hook) => {
            var lastEdited = "Never";
            if(hook.lastEditedAt !== 0) {
                lastEdited = getDate(hook.lastEditedAt);
            };
            finalHooks.push({
                "hookId": hook.hookId,
                "customName": hook.customName,
                "timesRan": hook.timesRan,
                "lastEditedAt": lastEdited,
            });
        });
        return finalHooks;
    } else {
        return [];
    };
}


module.exports = {
    queryDB,
    getDate,
    hashPassword,
    randomString,
    newCookie,
    createSession,
    checkUserExistsByNumber,
    checkUserExistsByEmail,
    loginRequiredMiddleware,
    fetchUser,
    verifyCaptchaMiddleware,
    createUser,
    checkValidEmail,
    sendResetEmail,
    fetchHook,
    newHook,
    getHooks,
}

