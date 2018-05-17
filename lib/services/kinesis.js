const Promise = require('the-promise');
const _ = require('lodash');

class AWSKinesisClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._kinesis = parent.getAwsService('kinesis');
    }

    queryAll(prefix, marker, result)
    {
        if (!result) {
            result = [];
        }

        var params = {
            Limit: 1,
            ExclusiveStartStreamName: marker
        };
        this.logger.verbose('Query Kinesis Streams...',  params);
        return this._kinesis.listStreams(params)
            .then(data => {
                var streamNames = data.StreamNames;
                if (prefix) {
                    streamNames = streamNames.filter(x => _.startsWith(x, prefix));
                }
                return Promise.serial(streamNames, x => {
                        return this.query(x)
                            .then(obj => { result.push(obj); });
                    })
                    .then(() => {
                        if (data.HasMoreStreams) {
                            return this.queryAll(prefix, _.last(data.StreamNames), result);
                        }
                        return result;
                    });
            });
    }

    query(name)
    {
        var params = {
            StreamName: name
        };
        this.logger.verbose('Query Kinesis Stream %s...', name);
        return this._kinesis.describeStream(params)
            .then(data => {
                return data.StreamDescription;
            })
            .catch(reason => {
                if (reason.code == 'ResourceNotFoundException') {
                    return null;
                }
                throw reason;
            });
    }

    create(name)
    {
        return Promise.resolve()
            .then(() => this.query(name))
            .then(stream => {
                if (stream) {
                    return stream;
                } else {
                    return this._create(name);
                }
            })
            .then(stream => {
                this.logger.verbose('Kinesis Stream %s Final Create Result: ', name, stream);
                return stream;
            })
    }

    _create(name)
    {
        var params = {
            StreamName: name,
            ShardCount: 1
        };
        this.logger.info('Creating Kinesis Stream %s...',  name);
        this.logger.verbose('Creating Kinesis Stream...',  params);
        return this._kinesis.createStream(params)
            .then(data => {
                this.logger.verbose('Created Kinesis Stream %s...', name, data);
                return this.query(name);
            })
            .then(data => {
                this.logger.verbose('Kinesis Stream %s Create Result: ', name, data);
                return this._waitReady(data);
            });
    }

    delete(name)
    {
        var params = {
            StreamName: name
        };
        this.logger.info('Deleting Kinesis Stream %s...', name);
        this.logger.verbose('Deleting Kinesis Stream %s...', name, params);
        return this._kinesis.deleteStream(params)
            .then(data => {
                this.logger.verbose('Deleting Kinesis Stream %s...',  name, data);
                return this.query(name);
            })
            .then(data => this._waitReady(data))
            .then(() => {
                this.logger.verbose('Deleted Kinesis Stream %s.',  name);
            })
            ;
    }

    _waitReady(stream)
    {
        if (!stream) {
            return null;
        }

        this.logger.info('Waiting Kinesis Stream %s ready...', stream.StreamName);

        if (stream.StreamStatus == 'CREATING' ||
            stream.StreamStatus == 'UPDATING' ||
            stream.StreamStatus == 'DELETING')
        {
            return Promise.timeout(10 * 1000)
                .then(() => {
                    return this.query(stream.StreamName);
                })
                .then(newStream => {
                    return this._waitReady(newStream);
                });
        }

        return stream;
    }
}

module.exports = AWSKinesisClient;
