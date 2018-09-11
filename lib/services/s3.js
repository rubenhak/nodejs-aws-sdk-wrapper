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
        return this._s3.getObject(params);
    }

    putObject(bucket, key, data)
    {
        var params = _.clone(data);
        params.Bucket = bucket;
        params.Key = key;
        this.logger.info('Putting S3 Object %s::%s...', bucket, key);
        return this._s3.putObject(params);
    }

    upload(bucket, key, stream)
    {
        var params = {
            Bucket: bucket,
            Key: key,
            Body: stream
        }
        this.logger.info('Uploading to S3 %s::%s...', bucket, key);
        return this._s3.upload(params);
    }

    createBucket(bucket, options, tags)
    {
        return this.queryBucket(bucket)
            .then(result => {
                if (result) {
                    return result;
                }

                var params;
                if (options) {
                    params = _.clone(options);
                } else {
                    params = {};
                }
                params.Bucket = bucket;
                this.logger.info('Creating bucket %s...', bucket);
                this.logger.debug('Creating bucket %s...', bucket, params);
                return this._s3.createBucket(params)
                    .then(() => this.queryBucket(bucket));
            })
            .then(() => {
                var params = {
                    Bucket: bucket,
                    Tagging: {
                        TagSet: [] 
                    }
                };
                if (tags) {
                    for(var tag of _.keys(tags)) {
                        params.Tagging.TagSet.push({
                            Key: tag,
                            Value: tags[tag]
                        });
                    }
                }
                if (params.Tagging.TagSet) {
                    this.logger.info('Creating bucket tags %s...', bucket);
                    this.logger.debug('Creating bucket tags %s...', bucket, params);
                        return this._s3.putBucketTagging(params)
                        .then(() => this.queryBucket(bucket));
                }
            })
    }

    queryBucket(bucket)
    {
        var params = {
            Bucket: bucket
        }
        this.logger.info('Querying bucket %s...', bucket);
        return this._s3.headBucket(params)
            .then(result => {
                return {
                    Bucket: bucket
                };
            })
            .then(bucket => this._attachBucketTags(bucket))
            .then(bucket => this._fetchBucketLocation(bucket))
            .catch(reason => {
                if (reason.statusCode == 404) {
                    return null;
                }
                throw reason;
            });
    }

    _attachBucketTags(bucket)
    {
        var params = {
            Bucket: bucket.Bucket
        }
        bucket.Tags = {}
        return this._s3.getBucketTagging(params)
            .then(result => {
                if (result && result.TagSet) {
                    for(var x of result.TagSet) {
                        bucket.Tags[x.Key] = x.Value;
                    }
                }
                return bucket;
            })
            .catch(reason => {
                if (reason.statusCode == 404) {
                    return bucket;
                }
                throw reason;
            })
    }

    _fetchBucketLocation(bucket)
    {
        var params = {
            Bucket: bucket.Bucket
        }
        return this._s3.getBucketLocation(params)
            .then(result => {
                var region = result.LocationConstraint;
                if (!region) {
                    region = "us-east-1"
                }
                bucket.CreateBucketConfiguration = {
                    LocationConstraint: region
                }
                return bucket;
            })
    }

    deleteBucket(bucket)
    {
        var params = {
            Bucket: bucket
        };
        this.logger.info('Deleting bucket %s...', bucket);
        return this._s3.deleteBucket(params);
    }

    queryAllBuckets(prefix)
    {
        var params = {
        };
        return this._s3.listBuckets(params)
            .then(result => {
                if (!result) {
                    return []
                }
                if (!result.Buckets) {
                    return []
                }
                var buckets = result.Buckets.map(x => x.Name);
                if (prefix) {
                    buckets = buckets.filter(x => _.startsWith(x, prefix))
                }
                return Promise.serial(buckets, x => this.queryBucket(x))
            });
    }

}

module.exports = AWSS3Client;
