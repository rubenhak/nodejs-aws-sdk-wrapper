const Promise = require('the-promise');
const _ = require('lodash');
const ArchiveTools = require('../archive-tools');
const crypto = require('crypto');
const deepequal = require('deep-equal');

function calculateSha256(buffer)
{
    return new Promise(function(resolve, reject) {
        const hash = crypto.createHash('sha256');

        hash.on('readable', () => {
            const data = hash.read();
            if (data) {
                resolve(data.toString('base64'));
            } else {
                reject('data not present');
            }
        });

        hash.write(buffer);
        hash.end();
    });
}

class AWSLambdaClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._lambda = parent.getAwsService('lambda');
    }

    query(name)
    {
        this.logger.verbose('Querying Lambda %s...', name);
        var params = {
            FunctionName: name
        };
        return this._lambda.getFunction(params)
            .then(data => {
                this.logger.verbose('Lambda %s = ', name, data);
                return data;
            })
            .catch(error => {
                if (error.code == 'ResourceNotFoundException') {
                    return null;
                } else {
                    throw error;
                }
            });
    }

    setup(name, config, path)
    {
        var zipData = null;
        var obj = null;
        var isHashDifferent = false;
        return Promise.all([
                this._extractCodePackage(name, path),
                this.query(name)
            ])
            .then(results => {
                zipData = results[0];
                zipData.path = path;

                obj = results[1];
                if (obj) {
                    return calculateSha256(zipData)
                        .then(theHash => {
                            if (theHash == obj.Configuration.CodeSha256) {
                                isHashDifferent = false;
                                this.logger.verbose('Lambda %s code is latest.', name);
                            } else {
                                isHashDifferent = true;
                                this.logger.info('Lambda %s code is different.', name);
                                this.logger.info('Lambda %s code is different. current: %s, new: %s', name, obj.Configuration.CodeSha256, theHash);
                            }
                        });
                }
            })
            .then(() => {
                if (!obj) {
                    return this.create(name, config, {
                        ZipFile: zipData
                    });
                } else {

                    var currentConfig = _.pickBy(obj.Configuration, (v, k) => k in config);
                    this.logger.silly('Current: ' , currentConfig);
                    this.logger.silly('Desired: ' , config);
                    if (!deepequal(currentConfig, config)) {
                        return this.update(name, config);
                    }
                }
            })
            .then(() => {
                if (isHashDifferent) {
                    return this._updateCodeFromBuffer(name, zipData);
                }
            });
    }

    create(name, config, codeData)
    {
        var params = _.clone(config);
        params.FunctionName = name;
        params.Publish = true;
        if (codeData) {
            params.Code = codeData
        }

        this.logger.info('Creating Lambda %s...', name);
        this.logger.verbose('Creating Lambda %s...', name, params);
        return this._lambda.createFunction(params)
            .then(data => {
                this.logger.verbose('Lambda %s Create Result:', name, data);
                return data;
            });
    }

    update(name, config)
    {
        var params = _.clone(config);
        params.FunctionName = name;

        this.logger.info('Updating Lambda %s...', name);
        this.logger.verbose('Updating Lambda %s...', name, params);
        return this._lambda.updateFunctionConfiguration(params)
            .then(data => {
                this.logger.verbose('Lambda %s Updating Result:', name, data);
                return data;
            });
    }

    _extractCodePackage(name, path)
    {
        this.logger.info('Compressing %s for %s Lambda function...', path, name);
        return Promise.resolve()
            .then(() => ArchiveTools.compressDirectoryToBuffer(path))
            .then(zipData => {
                zipData.path = path;
                return zipData;
            });
    }

    updateCode(name, path)
    {
        this.logger.verbose('Compressing %s for %s Lambda function...', path, name);
        return this._extractCodePackage(name, path)
            .then(zipData => {
                zipData.path = path;
                return this._updateCodeFromBuffer(name, zipData)
            });
    }

    _updateCodeFromBuffer(name, zipData)
    {
        this.logger.verbose('Updating %s Lambda Code from %s...', name, zipData.path);
        var params = {
            FunctionName: name,
            Publish: true,
            ZipFile: zipData
        };
        return Promise.resolve()
            .then(() => this._lambda.updateFunctionCode(params))
            .then(() => {
                this.logger.info('Lambda Function Code %s updated.', name);
            });
    }

    invoke(name, data)
    {
        var params = {
            FunctionName: name,
            InvocationType: "Event",
            Payload: JSON.stringify(data)
        };

        this.logger.info('Invoking Lambda %s...', name);
        this.logger.verbose('Invoking Lambda %s...', name, params);
        return this._lambda.invoke(params)
            .then(result => {
                this.logger.verbose('Lambda %s Invoke Result:', name, result);
                return result;
            });
    }

}

module.exports = AWSLambdaClient;
