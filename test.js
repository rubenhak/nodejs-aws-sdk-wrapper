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
client.logger.level = 'silly';
//
// var dynamo = client.DynamoDB;
//
// var ClusterDeployments = dynamo.define('clusterDeployment', {
//     hashKey: 'accountId',
//     rangeKey: 'full_name',
//
//     timestamps: false,
//
//     schema: {
//         accountId: Joi.string(),
//         full_name: Joi.string(),
//         region: Joi.string(),
//         cluster: Joi.string(),
//         deployment: Joi.string(),
//         isProcessing: Joi.boolean(),
//         processingStartDate: Joi.date(),
//         isDirty: Joi.boolean(),
//         dirtyStartDate: Joi.date()
//     }
//
// });
//
// function doSomething()
// {
//     logger.info('doSomething....');
// }
//
// const ThrottledQueue = require('throttled-queue');
// var throttle = ThrottledQueue(10, 1000, true);
//
// function doWork()
// {
//     // logger.info('doWork....');
//     return new Promise(function(resolve, reject) {
//         throttle(() => {
//             try {
//                 return Promise.resolve(doSomething())
//                     .then(result => {
//                         resolve(result);
//                     })
//                     .catch(reason => {
//                         reject(reason);
//                     })
//             } catch (e) {
//                 reject(e);
//             }
//         });
//     });
// }

return Promise.resolve()
    .then(() => client.Vpc.queryAll({}))
    // .then(() => Promise.serial(_.range(100), () => doWork()))
    // .then(() => doWork())
    // .then(() => doWork())
    // .then(() => doWork())
    // .then(() => doWork())
    // .then(() => doWork())
    // .then(() => doWork())
    // .then(() => doWork())
    // .then(() => doWork())
    // .then(() => doWork())
    // .then(() => doWork())
    // .then(() => doWork())
    // .then(() => doWork())
    // .then(() => doWork())
    .then(obj => {
        logger.info('Result: ', obj);
    })
    .catch(error => {
        logger.error('There was error: ', error);
    });
