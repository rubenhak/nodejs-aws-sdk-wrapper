var logger = require('the-logger').setup('TEST', {
    enableFile: false
});
logger.info('Test Start...');

var Promise = require('the-promise');
var _ = require('the-lodash');
var Joi = require('@hapi/joi');

// var client = require('.')('us-west-2', {
//     profile: 'croundme'
// }, logger);
var client = require('.')('us-west-2', {
    profile: 'berlioz-test'// 'insieme', //'croundme', // 'berlioz'
}, logger);
client.logger.level = 'verbose';

return Promise.resolve()
    .then(() => client.ApiGatewayHelper)
    .then(() => client.DynamoDB)
    .then(() => {})
    .then(() => {
        return client.Task.queryAllForCluster('zzz')
    })
    .then(obj =>  {
        // console.log(obj)
        logger.info('Result: ', obj);
    })
    .catch(error => {
        logger.error('**************** There was error: ');
        logger.error(error);
    });
