const _ = require('lodash');
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
    
}

module.exports = AWSApiGatewayClient;
