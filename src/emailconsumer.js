var commons = require("../../commons/src/commons");
console.log(JSON.stringify(process.env, null, 4));
const conf = commons.merge(require('./conf/emailconsumer'), require('./conf/emailconsumer-' + (process.env.ENVIRONMENT || 'localhost')));
console.log(JSON.stringify(conf, null, 4));
const obj = commons.obj(conf);

const logger = obj.logger();
const eh = obj.event_handler();
const utility = obj.utility();

const util = require("util");
var ical = require('ical-generator');

var nodemailer = require('nodemailer');
const request = require('request-promise');


var hostname = require('os').hostname();
console.log("instrumentazione per appdynamics: ", process.env.APPDYNAMICS_HOSTS, hostname)
logger.info("instrumentazione per appdynamics: ", process.env.APPDYNAMICS_HOSTS, hostname)

var env_dynamics = {
    "dev" : "DEV",
    "tst" : "TEST",
    "prod": "PROD"
}

if(process.env.APPDYNAMICS_HOSTS && process.env.APPDYNAMICS_HOSTS.indexOf(hostname) !== -1){
    require("appdynamics").profile({
        controllerHostName: 'csi-net.saas.appdynamics.com',
        controllerPort: 443,
        controllerSslEnabled: true,
        accountName: 'csi-net',
        accountAccessKey: '00dfb3669f59',
        applicationName: 'NOTIFY_' + env_dynamics[process.env.ENVIRONMENT] + '_CSI-01',
        tierName: 'notify-' + conf.app_name,
        nodeName: 'notify-'+ conf.app_name + '-' + hostname,
        proxyHost: conf.appdynamics.proxyHost,
        proxyPort: conf.appdynamics.proxyPort
    })


}

var transporter = nodemailer.createTransport(conf.email_server);

transporter.sendMail = util.promisify(transporter.sendMail);

var templates = {};

async function getTemplate()
{
    try {
        logger.debug("get templates from mb: ",conf.mb.queues.keys);
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

function compile(body) {
    let message = body.payload;

    if(!message.email.template_id) throw {client_source:"emailconsumer",client_message:"template_id was not defined in message"};
    if(!templates[message.email.template_id]) throw {client_source:"emailconsumer",client_message:"this template_id doesn't exist"};

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



function checkTo(payload){
    return  payload.email.to
}

async function sendMail(body,preferences){

    var message = {};
    message.id = body.payload.id;
    message.bulk_id = body.payload.bulk_id;
    message.user_id = body.payload.user_id;
    message.tag = body.payload.tag;
    message.correlation_id = body.payload.correlation_id;
    await eh.info("trying to send email",JSON.stringify({
        message: message
    }));

    let cal;
    if(body.payload.memo){
        cal = ical();
        try{
          cal.createEvent(body.payload.memo);
        }catch(e){
          logger.error("error creating memo event: ", e.message);
          let error = {};
          error.type_error = "client_error";
          error.error = e.message;
          error.description = "error in memo format";
          throw error;
        }
    }



    logger.debug("trying to send email");
    try{
        var template = compile(body);
    }catch(e){
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
        content: new Buffer(cal.toString())
    }]

    try{
        await transporter.sendMail(mailOptions);
        await transporter.close();
        await eh.ok("email sent",JSON.stringify({
            sender: body.user.preference_service_name,
            message:message
        }));
        logger.info("email sent");
    }catch(err){
        throw err;
    }
}

//obj.consumer(message_section, checkFunction, sendFunction).execute();
logger.debug(JSON.stringify(process.env, null, 4));
logger.debug(JSON.stringify(conf, null, 4));
obj.consumer("email", checkEmail, checkTo,sendMail)();
