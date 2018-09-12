var logger = require('the-logger').setup('TEST', {
    enableFile: false
});
logger.info('Test Start...');

var Promise = require('the-promise');
var _ = require('lodash');
var Joi = require('joi');

// var client = require('.')('us-west-2', {
//     profile: 'croundme'
// }, logger);
var client = require('.')('us-east-1', {
    profile: 'berlioz'// 'insieme', //'croundme', // 'berlioz'
}, logger);
client.logger.level = 'verbose';

return Promise.resolve()
    .then(() => client.DynamoDB)
    .then(() => {})
    // .then(() => client.ApiGateway.queryAllRestAPIs('api'))
    // .then(() => client.ApiGateway.queryAllResources('kzg4eo15y2'))
    .then(() => client.ApiGateway.queryMethod('kzg4eo15y2', 'wyae3k', 'POST'))
    .then(obj =>  {
        // console.log(obj)
        logger.info('Result: ', obj);
    })
    .catch(error => {
        logger.error('**************** There was error: ');
        logger.error(error);
    });
