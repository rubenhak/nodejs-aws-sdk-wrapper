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

return Promise.resolve()
    .then(() => client.DynamoDB)
    .then(() => {})
    .then(obj =>  {
        // console.log(obj)
        logger.info('Result: ', obj);
    })
    .catch(error => {
        logger.error('**************** There was error: ');
        logger.error(error);
    });
