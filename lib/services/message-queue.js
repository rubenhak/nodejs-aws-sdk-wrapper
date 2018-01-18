const Promise = require('the-promise');
const _ = require('lodash');

function safeParse(x) {
    if (x == 'true') {
        return true;
    }
    if (x == 'false') {
        return false;
    }
    var parsed = parseInt(x);
    if (isNaN(parsed)) {
      return x;
    }
    return parsed;
}

function convertToStringDict(source) {
    var dest = {}
    for(var key of _.keys(source)) {
        dest[key] = source[key].toString();
    }
    return dest;
}

function convertToNormalDict(source) {
    var dest = {}
    for(var key of _.keys(source)) {
        dest[key] = safeParse(source[key]);
    }
    return dest;
}

class AWSMessageQueueClient
{
    constructor(parent)
    {
        this._parent = parent;
        this._logger = parent._logger;
        this._sqs = parent._sqs;
    }

    queryAll(cluster)
    {
        var params = {
          QueueNamePrefix: cluster
        };
        this._logger.verbose('Querying MessageQueues ...');
        this._logger.silly('Querying MessageQueue... %s', '', params);
        return this._sqs.listQueues(params).promise()
            .then(result => {
                    return Promise.serial(result.QueueUrls, x => this.query(x))
                });
    }

    create(name, fifoQueue, attributes, tags)
    {
        attributes = _.clone(attributes);
        if (fifoQueue) {
            name = name + '.fifo';
            attributes.FifoQueue = fifoQueue;
        }
        var params = {
            QueueName: name,
            Attributes: convertToStringDict(attributes)
        };
        var url = null;
        this._logger.info('Creating MessageQueue %s...', name);
        this._logger.verbose('Creating MessageQueue... %s', '', params);
        return this._sqs.createQueue(params).promise()
            .then(result => {
                    this._logger.info('MessageQueue Created... %s', '', result);

                    url = result.QueueUrl;
                    return this._setupTags(url, tags);
                })
            .then(() => Promise.timeout(30 * 1000))
            .then(() => this.query(url));
    }

    delete(url) {
        var params = {
            QueueUrl: url
        };
        this._logger.info('Deleting MessageQueue %s...', url);
        this._logger.verbose('Deleting MessageQueue... %s', '', params);
        return this._sqs.deleteQueue(params).promise();
    }

    _setupTags(url, tags)
    {
        var params = {
            QueueUrl: url,
            Tags: convertToStringDict(tags)
        };
        this._logger.info('Setting MessageQueue Tags %s...', url);
        this._logger.verbose('Setting MessageQueue Tags... %s', '', params);
        return this._sqs.tagQueue(params).promise();
    }

    _getTags(url) {
        var params = {
            QueueUrl: url
        };
        this._logger.verbose('Getting MessageQueue Tags... %s', '', params);
        return this._sqs.listQueueTags(params).promise()
            .then(result => {
                return convertToNormalDict(result.Tags);
            });
    }

    query(url)
    {
        var params = {
            QueueUrl: url,
            AttributeNames: [ 'All' ]
        };
        var queue = {
            QueueUrl: url,
            QueueName: url.substr(url.lastIndexOf('/') + 1)
        };
        this._logger.verbose('Querying MessageQueue... %s', '', params);
        return this._sqs.getQueueAttributes(params).promise()
            .catch(error => {
                    queue = null;
                    return null;
                })
            .then(result => {
                    if (!queue) {
                        return null;
                    }
                    queue.Attributes = convertToNormalDict(result.Attributes);
                    if (!queue.Attributes.FifoQueue) {
                        queue.Attributes.FifoQueue = false;
                    }
                    if (!queue.Attributes.ContentBasedDeduplication) {
                        queue.Attributes.ContentBasedDeduplication = false;
                    }
                    return this._getTags(url);
                })
            .then(result => {
                    if (!queue) {
                        return null;
                    }
                    queue.Tags = result;
                    return queue;
                });
    }

    update(url, attributes)
    {
        var params = {
            QueueUrl: url,
            Attributes: convertToStringDict(attributes)
        };
        this._logger.info('Updating MessageQueue %s...', url);
        this._logger.verbose('Updating MessageQueue... %s', '', params);
        return this._sqs.setQueueAttributes(params).promise();
    }
}

module.exports = AWSMessageQueueClient;
