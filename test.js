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
    profile: 'insieme', //'croundme', // 'berlioz'
}, logger);
client.logger.level = 'verbose';

return Promise.resolve()
    .then(() => client.DynamoDB)
    .then(() => {})
    // .then(() => client.SystemsManager.writeParameter('/prod/lab/kaka', '1234-abcd'))
    // .then(() => client.SystemsManager.queryAllParams('/prod/lab', {WithDecryption :false}))
    // .then(() => client.KeyManagement.createKey({}, { 'berlioz:deployment': 'prod'}))
    // .then(() => client.KeyManagement.queryAllKeys({ 'berlioz:deployment': 'prod'}))
    // .then(() => client.KeyManagement.removeKeyTags('a7d017a1-bd8b-438d-bb03-2b7d23f3b030', ["berlioz:deployment"]))
    // .then(() => client.KeyManagement.cancelKeyDeletion('fd621cf7-cae3-4f30-b9b3-2143325e75fd'))
    // .then(() => client.KeyManagement.queryKey('fd621cf7-cae3-4f30-b9b3-2143325e75fd'))
    // .then(() => client.KeyManagement.queryAllAliases())
    // .then(() => client.KeyManagement.createAlias("alias/berlioz/kaki", "21440bd1-5b05-42e8-b8ae-25be900a3855"))
    // .then(() => client.KeyManagement.deleteAlias("alias/berlioz/kaki"))
    .then(obj => {
        logger.info('Result: ', obj);
    })
    .catch(error => {
        logger.error('There was error: ', error);
    });
