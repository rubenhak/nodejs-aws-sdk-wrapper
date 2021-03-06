const Promise = require('the-promise');
const _ = require('the-lodash');
const ArchiveTools = require('../archive-tools');
const crypto = require('crypto');
const arnParser = require('aws-arn-parser');

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

    queryAll(prefix, result, marker)
    {
        if (!result) {
            result = [];
        }
        var params = {
            Marker: marker
        }
        return this._lambda.listFunctions(params)
            .then(data => {
                for(var x of data.Functions) {
                    if (prefix) {
                        if (!_.startsWith(x.FunctionName, prefix)) {
                            continue;
                        }
                    }
                    result.push(x)
                }
                if (data.NextMarker) {
                    return this.queryAll(prefix, result, data.NextMarker);
                } else {
                    return result;
                }
            });
    }

    queryAllFull(prefix, tagFilter)
    {
        return Promise.resolve(this.queryAll(prefix))
            .then(results => {
                return Promise.serial(results, x => this.query(x.FunctionName))
            })
            .then(results => {
                return results.filter(x => this._hasTags(x, tagFilter))
            });
    }

    _hasTags(obj, tagFilter) 
    {
        if (!tagFilter) {
            return true;
        }
        for(var tag of _.keys(tagFilter)) {
            if (tagFilter[tag] != obj.Tags[tag]) {
                return false;
            }
        }
        return true;
    }

    query(name)
    {
        this.logger.verbose('Querying Lambda %s...', name);
        var params = {
            FunctionName: name
        };
        var lambdaData = null
        return this._lambda.getFunction(params)
            .then(data => {
                this.logger.verbose('Lambda %s = ', name, data);
                lambdaData = data;
                return this.queryPolicy(name);
            })
            .then(policyData => {
                lambdaData.PolicyStatements = [];
                if (policyData) {
                    if (policyData.Statement) {
                        lambdaData.PolicyStatements = policyData.Statement;
                    }
                }
                return lambdaData;
            })
            .catch(error => {
                if (error.code == 'ResourceNotFoundException') {
                    return null;
                } else {
                    throw error;
                }
            });
    }

    queryPolicy(name)
    {
        this.logger.verbose('Querying Lambda Policy %s...', name);
        var params = {
            FunctionName: name
        };
        return this._lambda.getPolicy(params)
            .then(data => {
                this.logger.verbose('Lambda Policy %s: ', name, data);
                if (data.Policy) {
                    return JSON.parse(data.Policy);
                }
                return {};
            })
            .catch(error => {
                if (error.code == 'ResourceNotFoundException') {
                    return {};
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
                    if (!_.fastDeepEqual(currentConfig, config)) {
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

    updateFunctionCode(name, codeInfo)
    {
        var params = _.clone(codeInfo);
        params.FunctionName = name;
        params.Publish = true;
        this.logger.info('Updating %s Lambda code...', name);
        this.logger.verbose('Updating %s Lambda code...', name, params);
        return this._lambda.updateFunctionCode(params)
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

    delete(name)
    {
        var params = {
            FunctionName: name
        };

        this.logger.info('Deleting Lambda %s...', name);
        this.logger.verbose('Deleting Lambda %s...', name, params);
        return this._lambda.deleteFunction(params)
            .then(result => {
                this.logger.verbose('Lambda %s Deleted.', result);
                return result;
            });
    }

    addPermission(name, statementId, config)
    {
        var params = _.clone(config);
        params.FunctionName = name;
        params.StatementId = statementId;
        this.logger.info('Add Lambda Permission %s...', name);
        this.logger.verbose('Add Lambda Permission %s...', name, params);
        return this._lambda.addPermission(params)
            .then(result => {
                this.logger.verbose('Lambda %s Add permission result.', result);
                return result;
            });
    }

    removePermission(name, statementId)
    {
        var params = {
            FunctionName: name,
            StatementId: statementId
        }
        this.logger.info('Remove Lambda Permission %s...', name);
        this.logger.verbose('Remove Lambda Permission...', name, params);
        return this._lambda.removePermission(params)
            .then(result => {
                this.logger.verbose('Lambda %s Remove permission result.', result);
                return result;
            })
            .catch(error => {
                if (error.code == 'ResourceNotFoundException') {
                    return null;
                } else {
                    throw error;
                }
            });
    }

    queryAllEventSourceMappings(prefix, result, marker)
    {
        if (!result) {
            result = [];
        }
        var params = {
            Marker: marker
        }
        return this._lambda.listEventSourceMappings(params)
            .then(data => {
                return Promise.serial(data.EventSourceMappings, x => {
                    var functionArn = arnParser(x.FunctionArn);
                    var functionName = functionArn.undefined;
                    if (prefix) {
                        if (!_.startsWith(functionName, prefix))
                        {
                            return;
                        }
                    }
                    return this.stabilizeEventSourceMapping(x);
                })
                .then(items => items.filter(x => x))
                .then(items => {
                    result = _.concat(result, items);
                    if (data.NextMarker) {
                        return this.queryAllEventSourceMappings(prefix, result, data.NextMarker);
                    } else {
                        return result;
                    }
                })
            });
    }

    queryEventSourceMapping(id)
    {
        var params = {
            UUID: id
        };
        this.logger.info('queryEventSourceMapping %s...', id);
        this.logger.verbose('queryEventSourceMapping...', params);
        return this._lambda.getEventSourceMapping(params)
            .catch(reason => {
                if (reason.code == 'ResourceNotFoundException') {
                    return null;
                } else {
                    throw reason;
                }
            })
            .then(result => {
                this.logger.verbose('queryEventSourceMapping result.', result);
                return this.stabilizeEventSourceMapping(result);
            });
    }

    stabilizeEventSourceMapping(obj)
    {
        if (!obj) {
            return null;
        }
        if (!_.endsWith(obj.State, 'ing')) {
            return obj;
        }
        return Promise.timeout(1000)
            .then(() => this.queryEventSourceMapping(obj.UUID))
            .then(obj => this.stabilizeEventSourceMapping(obj));
    }

    createEventSourceMapping(lambdaName, eventSourceArn, config)
    {
        var params;
        if (config) {
            params = _.clone(config);
        } else {
            params = {};
        }
        params.FunctionName = lambdaName;
        params.EventSourceArn = eventSourceArn;
        this.logger.info('createEventSourceMapping %s...', lambdaName);
        this.logger.verbose('createEventSourceMapping...', params);
        return this._lambda.createEventSourceMapping(params)
            .then(result => {
                this.logger.verbose('createEventSourceMapping result.', result);
                return this.stabilizeEventSourceMapping(result);
            });
    }

    deleteEventSourceMapping(id)
    {
        var params = {
            UUID: id
        };
        this.logger.info('deleteEventSourceMapping %s...', id);
        this.logger.verbose('deleteEventSourceMapping...', params);
        return this._lambda.deleteEventSourceMapping(params)
            .then(result => {
                this.logger.verbose('deleteEventSourceMapping result.', result);
                return this.stabilizeEventSourceMapping(result);
            });
    }
}

module.exports = AWSLambdaClient;
