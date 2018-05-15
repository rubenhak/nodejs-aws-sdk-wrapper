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
    .then(() => {
        var tableConfig = {
            AttributeDefinitions: [{
                    AttributeName: "Artist",
                    AttributeType: "S"
                },
                {
                    AttributeName: "SongTitle",
                    AttributeType: "S"
                }
            ],
            KeySchema: [{
                    AttributeName: "Artist",
                    KeyType: "HASH"
                },
                {
                    AttributeName: "SongTitle",
                    KeyType: "RANGE"
                }
            ]
        };
        return client.Dynamo.create('myNewTable', tableConfig);
    })
    // .then(() => client.Dynamo.queryAll('my'))
    .then(() => client.Dynamo.delete('myNewTable'))
    .then(obj => {
        logger.info('Result: ', obj);
    })
    .catch(error => {
        logger.error('There was error: ', error);
    });
