const Promise = require('the-promise');
const _ = require('lodash');

class AWSS3Client
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._s3 = parent.getAwsService('s3');
    }

    getObject(bucket, key)
    {
        var params = {
            Bucket: bucket,
            Key: key
        }
        this.logger.info('Fetching S3 Object %s::%s...', bucket, key);
        this.logger.verbose('Fetching S3 Object: ', params);
        return this._sqs.getObject(params);
    }

    putObject(bucket, key, data)
    {
        var params = _.clone(data);
        params.Bucket = bucket;
        params.Key = key;
        this.logger.info('Putting S3 Object %s::%s...', bucket, key);
        return this._sqs.putObject(params);
    }


}

module.exports = AWSS3Client;