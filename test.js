var logger = require('the-logger').setup('bunyan', 'TEST', {
    enableFile: false
});
logger.info('Test Start...');

var client = require('.')('us-east-1');
// client.logger.level = 'debug';

client.Vpc.fetchForCluster(true, 'myproject', '10.0.0.0/16')
    .then(obj => {
        logger.info('The VPC: ', obj);
    })
    .catch(error => {
        logger.error('There was error: ', error);
    });
