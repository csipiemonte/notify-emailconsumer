var commons = require("../../commons/src/commons");
const conf = commons.merge(require('./conf/emailconsumer'), require('./conf/emailconsumer-' + (process.env.ENVIRONMENT || 'localhost')));
const obj = commons.obj(conf);

const logger = obj.logger();
const eh = obj.event_handler();
const utility = obj.utility();

const util = require("util");
const { default: ical } = require('ical-generator');

var nodemailer = require('nodemailer');
const request = require('request-promise');

var templates = {};

async function getTemplate()
{
    try {
        logger.debug("get templates from mb: ", conf.mb.queues.keys);
        let options = {
            url: conf.mb.queues.keys,
            method: 'GET',
            headers: {
                'x-authentication': conf.mb.token
            },
            json: true
        };

        templates = await request(options);
        logger.info("templates: ",Object.keys(templates))
    } catch (e) {
        logger.error("error getting template: ", e.message);
        setTimeout(getTemplate,5000);
    }
}

getTemplate();
setInterval(getTemplate, 600 * 1000);

function compile(body) {
    let message = body.payload;

    if(!message.email.template_id) throw {client_source:"emailconsumer", client_message:"template_id was not defined in message"};
    if(!templates[message.email.template_id]) throw {client_source:"emailconsumer", client_message:"this template_id doesn't exist"};

    let template = Buffer.from(templates[message.email.template_id], 'base64').toString();
    return template.replace("{{body}}", message.email.body);
}

function checkEmail(payloadMessage) {
    var res = [];

    if (!payloadMessage) {
        res.push("payload not present");
        return res;
    }
    if (typeof payloadMessage !== 'object' || Array.isArray(payloadMessage)) {
        res.push("payload element is not a valid object");
        return res;
    }

    if (!payloadMessage.id) res.push("id field is mandatory");
    if (!payloadMessage.user_id) res.push("user_id is mandatory");
    if (!payloadMessage.email) res.push("email is mandatory");
    if (!utility.checkNested(payloadMessage,"email.subject")) res.push("email subject is mandatory");
    if (!utility.checkNested(payloadMessage,"email.body")) res.push("email body is mandatory");
    return res;
}

function checkTo(payload) {
    return  payload.email.to;
}

async function sendMail(body, preferences) {
    var message = {
        id: body.payload.id,
        bulk_id: body.payload.bulk_id,
        user_id: body.payload.user_id,
        tag: body.payload.tag,
        correlation_id: body.payload.correlation_id,
        tenant: body.user.tenant ? body.user.tenant : conf.defaulttenant
    }
    
    eh.info("trying to send email", JSON.stringify({
        message: message
    }));
    logger.debug("trying to send email");

    let cal;
    if(body.payload.memo) {
        cal = ical();
        try {
          cal.createEvent(body.payload.memo);
        } catch(e) {
          logger.error("error creating memo event: ", e.message);
          let error = {};
          error.type_error = "client_error";
          error.error = e.message;
          error.description = "error in memo format";
          throw error;
        }
    }

    try {
        var template = compile(body);
    } catch(e) {
        throw e;
    }

    let mailOptions = {
        from: body.user.preferences.email,
        to: preferences.body.email,
        subject: body.payload.email.subject,
        html: template,
    };

    if(cal) mailOptions.alternatives= [{
        contentType: "text/calendar",
        content: Buffer.from(cal.toString())
    }]

    try {
        let mailTransport;

        if(body.user.preferences.email_username && body.user.preferences.email_password) {
            mailTransport = {
                host: conf.authenticated_email_server.host,
                port: conf.authenticated_email_server.port,
                secure: false, // upgrade later with STARTTLS
                auth: {
                  user: body.user.preferences.email_username,
                  pass: body.user.preferences.email_password,
                },
            };    
        } else {
            mailTransport = conf.email_server;
        }
        let transporter = nodemailer.createTransport(mailTransport);
        transporter.sendMail = util.promisify(transporter.sendMail);
        await transporter.sendMail(mailOptions);
        await transporter.close();
        
        eh.ok("email sent",JSON.stringify({
            sender: body.user.preference_service_name,
            message: message
        }));
        logger.info("email sent");
    } catch(err) {
        throw err;
    }
}

logger.info("environment:", JSON.stringify(process.env, null, 4));
logger.info("configuration:", JSON.stringify(conf, null, 4));
obj.consumer("email", checkEmail, checkTo, sendMail)();