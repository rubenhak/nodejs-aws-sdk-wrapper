var logger = require('the-logger').setup('TEST', {
    enableFile: false
});
logger.info('Test Start...');

var Promise = require('the-promise');
var _ = require('the-lodash');
var Joi = require('joi');

// var client = require('.')('us-west-2', {
//     profile: 'croundme'
// }, logger);
var client = require('.')('us-east-1', {
    profile: 'insieme'// 'insieme', //'croundme', // 'berlioz'
}, logger);
client.logger.level = 'verbose';

var helper = client.ApiGatewayHelper;

return Promise.resolve()
    .then(() => client.DynamoDB)
    .then(() => {})
    .then(() => helper.refresh())
    .then(() => helper.allMethods)


    // .then(() => client.ApiGateway.queryAllRestAPIs('api'))
    // .then(() => client.ApiGateway.queryAllResources('kzg4eo15y2'))
    // .then(() => client.ApiGateway.deleteAuthorizer("ef2fcgvofi", "zvmleb"))
    // .then(() => helper.refresh())
    // .then(() => helper.allAuthorizers)
    // .then(() => helper.createAuthorizer("ef2fcgvofi", "mimi", "COGNITO_USER_POOLS", {
    //     // "authType": "cognito_user_pools",
    //     "identitySource": "method.request.header.Authorization",
    //     "providerARNs": [
    //         "arn:aws:cognito-idp:us-east-1:227920884814:userpool/us-east-1_fDz6tcab0"
    //     ]
    // }))
    .then(obj =>  {
        // console.log(obj)
        logger.info('Result: ', obj);
    })
    .catch(error => {
        logger.error('**************** There was error: ');
        logger.error(error);
    });
