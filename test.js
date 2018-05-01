var logger = require('the-logger').setup('bunyan', 'TEST', {
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
    profile: 'croundme', // 'berlioz'
}, logger);
client.logger.level = 'info';

return Promise.resolve()
    .then(() => client.Vpc.queryAll({}))
    .then(obj => {
        logger.info('Result: ', obj);
    })
    .catch(error => {
        logger.error('There was error: ', error);
    });
