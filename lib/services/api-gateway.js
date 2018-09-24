const _ = require('the-lodash');
const Promise = require('the-promise');

class AWSApiGatewayClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._apigateway = parent.getAwsService('apigateway');
    }
    
    queryAllRestAPIs(prefix, position, results)
    {
        if (!results) {
            results = []
        }
        var params = {
        };
        if (position) {
            params.position = position;
        }
        this.logger.verbose('queryAllRestAPIs %s...',  prefix);
        return this._apigateway.getRestApis(params)
            .then(result => {
                var items = result.items;
                if (prefix) {
                    items = items.filter(x => _.startsWith(x.name, prefix))
                }
                return Promise.serial(items, x => this.queryRestAPI(x.id))
                    .then(fullItems => {
                        results = _.concat(results, fullItems);
                        if (result.position) {
                            return this.queryAllRestAPIs(prefix, result.position, results)
                        }
                        return results;
                    })
            });
    }

    queryRestAPI(id)
    {
        var params = {
            restApiId: id
        };
        this.logger.verbose('queryRestAPI %s...',  id);
        return this._apigateway.getRestApi(params)
            .then(result => {
                this.logger.verbose('queryRestAPI Result:',  result);
                return result;
            });
    }

    queryAllResources(restApiId, position, results)
    {
        if (!results) {
            results = []
        }
        var params = {
            restApiId: restApiId
        };
        if (position) {
            params.position = position;
        }
        this.logger.verbose('queryAllResources...',  params);
        return this._apigateway.getResources(params)
            .then(result => {
                results = _.concat(results, result.items);
                if (result.position) {
                    return this.queryAllResources(restApiId, result.position, results)
                }
                return results;
            });
    }

    queryResource(restApiId, resourceId)
    {
        var params = {
            restApiId: restApiId,
            resourceId: resourceId
        };
        this.logger.verbose('queryResource...',  params);
        return this._apigateway.getResource(params)
            .then(result => {
                return result;
            });
    }

    createResource(parentId, pathPart, restApiId)
    {
        var params = {
            parentId: parentId,
            pathPart: pathPart, 
            restApiId: restApiId
        };
        this.logger.verbose('createResource...',  params);
        return this._apigateway.createResource(params)
            .then(result => {
                this.logger.verbose('createResource result:',  result);
                return result;
            });
    }

    deleteResource(restApiId, resourceId)
    {
        var params = {
            restApiId: restApiId,
            resourceId: resourceId
        };
        this.logger.verbose('deleteResource...',  params);
        return this._apigateway.deleteResource(params)
            .then(result => {
                this.logger.verbose('deleteResource result:',  result);
                return result;
            });
    }

    queryMethod(restApiId, resourceId, method)
    {
        var params = {
            restApiId: restApiId,
            resourceId: resourceId, 
            httpMethod: method
        };
        this.logger.verbose('queryMethod...',  params);
        return this._apigateway.getMethod(params)
            .then(result => {
                return result;
            });
    }

    createMethod(restApiId, resourceId, method)
    {
        var params = {
            restApiId: restApiId,
            resourceId: resourceId, 
            httpMethod: method,
            authorizationType: 'NONE'
        };
        this.logger.verbose('createMethod...',  params);
        return this._apigateway.putMethod(params)
            .then(result => {
                this.logger.verbose('createMethod result:',  result);
                return result;
            });
    }

    deleteMethod(restApiId, resourceId, method)
    {
        var params = {
            restApiId: restApiId,
            resourceId: resourceId, 
            httpMethod: method
        };
        this.logger.verbose('deleteMethod...',  params);
        return this._apigateway.deleteMethod(params)
            .then(result => {
                this.logger.verbose('deleteMethod result:',  result);
                return result;
            });
    }

    setupMethodIntegration(restApiId, resourceId, method, type, config)
    {
        var params;
        if (config) {
            params = _.clone(config);
        } else {
            params = {}
        }
        params.restApiId = restApiId;
        params.resourceId = resourceId;
        params.httpMethod = method;
        params.type = type;
        this.logger.verbose('setupMethodIntegration...',  params);
        return this._apigateway.putIntegration(params)
            .then(result => {
                this.logger.verbose('setupMethodIntegration result:',  result);
                return result;
            });
    }
    
    queryAllAuthorizers(restApiId, position, results)
    {
        if (!results) {
            results = []
        }
        var params = {
            restApiId: restApiId
        };
        if (position) {
            params.position = position;
        }
        this.logger.verbose('queryAllAuthorizers...',  params);
        return this._apigateway.getAuthorizers(params)
            .then(result => {
                results = _.concat(results, result.items);
                if (result.position) {
                    return this.queryAllAuthorizers(restApiId, result.position, results)
                }
                return results;
            });
    }

    queryAuthorizer(restApiId, id)
    {
        var params = {
            restApiId: restApiId,
            authorizerId: id
        };
        this.logger.verbose('queryAuthorizer...',  params);
        return this._apigateway.getAuthorizer(params)
            .then(result => {
                return result;
            });
    }

    createAuthorizer(restApiId, name, type, config)
    {
        var params;
        if (config) {
            params = _.clone(config);
        } else {
            params = {};
        }
        params.restApiId = restApiId;
        params.name = name;
        params.type = type;
        this.logger.verbose('createAuthorizer...',  params);
        return this._apigateway.createAuthorizer(params)
            .then(result => {
                this.logger.verbose('createAuthorizer result:', result);
                return result;
            });
    }

    updateAuthorizer(restApiId, id, config)
    {
        var params;
        if (config) {
            params = _.clone(config);
        } else {
            params = {};
        }
        params.restApiId = restApiId;
        params.authorizerId = id;
        this.logger.verbose('updateAuthorizer...',  params);
        return this._apigateway.updateAuthorizer(params)
            .then(result => {
                this.logger.verbose('updateAuthorizer result:', result);
                return result;
            });
    }

    deleteAuthorizer(restApiId, id)
    {
        var params = {
            restApiId: restApiId,
            authorizerId: id
        };
        this.logger.verbose('deleteAuthorizer...',  params);
        return this._apigateway.deleteAuthorizer(params)
            .then(result => {
                this.logger.verbose('deleteAuthorizer result:', result);
                return result;
            });
    }

    createRestApi(name, config)
    {
        var params;
        if (config) {
            params = _.clone(config);
        } else {
            params = {}
        }
        params.name = name
        this.logger.verbose('createRestApi...',  params);
        return this._apigateway.createRestApi(params)
            .then(result => {
                this.logger.verbose('createRestApi result:', result);
                return result;
            });
    }

    deleteRestApi(restApiId)
    {
        var params = {
            restApiId: restApiId
        };
        this.logger.verbose('deleteRestApi...',  params);
        return this._apigateway.deleteRestApi(params)
            .then(result => {
                this.logger.verbose('deleteRestApi result:', result);
                return result;
            });
    }
    
    getDeployments(restApiId, position, results)
    {
        if (!results) {
            results = []
        }
        var params = {
            restApiId: restApiId
        };
        if (position) {
            params.position = position;
        }
        this.logger.verbose('getDeployments...',  params);
        return this._apigateway.getDeployments(params)
            .then(result => {
                results = _.concat(results, result.items);
                if (result.position) {
                    return this.getDeployments(restApiId, result.position, results)
                }
                return results;
            });
    }

    queryStages(restApiId, position, results)
    {
        if (!results) {
            results = []
        }
        var params = {
            restApiId: restApiId
        };
        if (position) {
            params.position = position;
        }
        this.logger.verbose('queryStages...',  params);
        return this._apigateway.getStages(params)
            .then(result => {
                results = _.concat(results, result.item);
                if (result.position) {
                    return this.queryStages(restApiId, result.position, results)
                }
                return results;
            });
    }

    queryStage(restApiId, stageName)
    {
        var params = {
            restApiId: restApiId,
            stageName: stageName
        };
        this.logger.verbose('queryStage...',  params);
        return this._apigateway.getStage(params)
            .then(result => {
                return result;
            });
    }

    createDeployment(restApiId, config)
    {
        var params;
        if (config) {
            params = _.clone(config);
        } else {
            params = {}
        }
        params.restApiId = restApiId
        this.logger.verbose('createDeployment...',  params);
        return this._apigateway.createDeployment(params)
            .then(result => {
                this.logger.verbose('createDeployment result:', result);
                return result;
            });
    }

    createStage(restApiId, config)
    {
        var params;
        if (config) {
            params = _.clone(config);
        } else {
            params = {}
        }
        params.restApiId = restApiId
        this.logger.verbose('createStage...',  params);
        return this._apigateway.createStage(params)
            .then(result => {
                this.logger.verbose('createStage result:', result);
                return result;
            });
    }

    updateStageDeployment(restApiId, stageName, deploymentId)
    {
        var params = {}
        params.restApiId = restApiId
        params.stageName = stageName
        params.patchOperations = [{
            op: 'replace',
            path: '/deploymentId',
            value: deploymentId
        }]
        this.logger.verbose('updateStageDeployment...',  params);
        return this._apigateway.updateStage(params)
            .then(result => {
                this.logger.verbose('updateStageDeployment result:', result);
                return result;
            });
    }

    updateStageVariable(restApiId, stageName, variable, value)
    {
        var params = {}
        params.restApiId = restApiId
        params.stageName = stageName
        params.patchOperations = [{
            op: 'replace',
            path: '/variables/' + variable,
            value: value
        }]
        this.logger.verbose('updateStageVariable...',  params);
        return this._apigateway.updateStage(params)
            .then(result => {
                this.logger.verbose('updateStageVariable result:', result);
                return result;
            });
    }

    deleteStageVariable(restApiId, stageName, variable)
    {
        var params = {}
        params.restApiId = restApiId
        params.stageName = stageName
        params.patchOperations = [{
            op: 'replace',
            path: '/variables/' + variable
        }]
        this.logger.verbose('deleteStageVariable...',  params);
        return this._apigateway.updateStage(params)
            .then(result => {
                this.logger.verbose('deleteStageVariable result:', result);
                return result;
            });
    }
}

module.exports = AWSApiGatewayClient;
