var logger = require('the-logger').setup('bunyan', 'TEST', {
    enableFile: false
});
logger.info('Test Start...');

var Promise = require('the-promise');
var Joi = require('joi');

var client = require('.')('us-east-1');
client.logger.level = 'info';

var dynamo = client.DynamoDB;

return Promise.resolve()
    .then(obj => {
        logger.info('Result: ', obj);
    })
    .catch(error => {
        logger.error('There was error: ', error);
    });
