module.exports = function(region, credentials, logger)
{
    if (!logger) {
        logger = require('the-logger').setup('bunyan', 'AWSClient', {
            enableFile: false
        });
        logger.level = 'info';
    }

    logger.info('Client Start...');

    const AWSClient = require('./lib');
    var client = new AWSClient(logger, region, credentials);
    return client;
}
