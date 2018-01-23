var logger = require('the-logger').setup('bunyan', 'TEST', {
    enableFile: false
});
logger.info('Test Start...');

var Promise = require('the-promise');
var Joi = require('joi');

var client = require('.')('us-east-1');
client.logger.level = 'info';

var dynamo = client.DynamoDB;

var ClusterDeployments = dynamo.define('clusterDeployment', {
    hashKey: 'accountId',
    rangeKey: 'full_name',

    timestamps: false,

    schema: {
        accountId: Joi.string(),
        full_name: Joi.string(),
        region: Joi.string(),
        cluster: Joi.string(),
        deployment: Joi.string(),
        isProcessing: Joi.boolean(),
        processingStartDate: Joi.date(),
        isDirty: Joi.boolean(),
        dirtyStartDate: Joi.date()
    }

});

//
return dynamo.model('clusterDeployment').query('723255635421').where('deployment-index').equals('test').exec()
    .then(result => {
        return result.Items;
    })
//return Promise.resolve()
    .then(obj => {
        logger.info('Result: ', obj);
    })
    .catch(error => {
        logger.error('There was error: ', error);
    });
