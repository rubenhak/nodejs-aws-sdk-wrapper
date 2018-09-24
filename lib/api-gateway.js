const Promise = require('the-promise');
const _ = require('the-lodash');

class ApiGatewayHelper 
{
    constructor(logger, apiGateway)
    {
        this._logger = logger;
        this._apiGateway = apiGateway;
        this._apis = {};
    }

    get allApis() {
        return _.values(this._apis).map(x => x.data);
    }

    get allResources() {
        return _.flatten(_.values(this._apis).map(x => x.resources));
    }

    get allMethods() {
        return _.flatten(_.values(this._apis).map(x => x.methods));
    }

    get allStages() {
        return _.flatten(_.values(this._apis).map(x => x.stages));
    }

    get allAuthorizers() {
        return _.flatten(_.values(this._apis).map(x => x.authorizers));
    }

    getApi(id)
    {
        return this._apis[id];
    }

    setAPIFilter(value)
    {
        this._filter = value;
    }

    refresh()
    {
        return Promise.resolve(this._apiGateway.queryAllRestAPIs(this._filter))
            .then(restApis => {
                for(var x of restApis) {
                    var helper = new ApiGatewayApi(this, this._logger, this._apiGateway, x);
                    this._apis[helper.id] = helper;
                }
                return Promise.serial(_.values(this._apis), x => x.refresh());
            });
    }

    queryApiResources(restApiId)
    {
        return Promise.resolve(this._apiGateway.queryAllResources(restApiId))
            .then(result => {
                for(var x of result) {
                    x.restApiId = restApiId;
                }
                return result;
            })
    }

    queryAuthorizers(restApiId)
    {
        return Promise.resolve(this._apiGateway.queryAllAuthorizers(restApiId))
            .then(result => {
                for(var x of result) {
                    x.restApiId = restApiId;
                }
                return result;
            })
    }

    queryAuthorizer(restApiId, id)
    {
        return Promise.resolve(this._apiGateway.queryAuthorizer(restApiId, id))
            .then(result => {
                if (result) {
                    result.restApiId = restApiId;
                }
                return result;
            })
    }

    createAuthorizer(restApiId, name, type, config)
    {
        return Promise.resolve(this._apiGateway.createAuthorizer(restApiId, name, type, config))
            .then(result => {
                result.restApiId = restApiId;
                this.getApi(restApiId)._authorizers[result.id] = result;
                return result;
            })
    }

    queryStages(restApiId)
    {
        return Promise.resolve(this._apiGateway.queryStages(restApiId))
            .then(result => {
                for(var x of result) {
                    x.restApiId = restApiId;
                }
                return result;
            })
    }

    queryStage(restApiId, name)
    {
        return Promise.resolve(this._apiGateway.queryStage(restApiId, name))
            .then(result => {
                if (result) {
                    result.restApiId = restApiId;
                }
                return result;
            })
    }

    createStage(restApiId, config)
    {
        return Promise.resolve(this._apiGateway.createStage(restApiId, config))
            .then(result => {
                result.restApiId = restApiId;
                return result;
            })
    }

    createRestApi(name, config)
    {
        return Promise.resolve(this._apiGateway.createRestApi(name, config))
            .then(result => {
                var helper = new ApiGatewayApi(this, this._logger, this._apiGateway, result);
                this._apis[helper.id] = helper;
                return helper.data;
            })
    }

    deleteRestApi(id)
    {
        return Promise.resolve(this._apiGateway.deleteRestApi(id))
            .then(result => {
                delete this._apis[id];
                return result;
            })
    }

    queryResource(info)
    {
        return Promise.resolve(this._apiGateway.queryResource(info.restApiId, info.id))
            .then(result => {
                if (!result) {
                    return null;
                }
                result.restApiId = info.restApiId;
                return result;
            })
    }

    createResource(info)
    {
        if (info.path == "/") {
            return Promise.resolve(this.queryApiResources(info.restApiId))
                .then(resources => {
                    return _.find(resources, x => x.path == info.path);
                });
        }
        var index = info.path.lastIndexOf('/');
        var pathPart = "";
        if (index >= 0) {
            pathPart = info.path.substring(index + 1)
        } 
        return this._apiGateway.createResource(info.parentId, pathPart, info.restApiId)
            .then(result => {
                result.restApiId = info.restApiId;
                return result;
            });
    }

    queryMethod(info)
    {
        return Promise.resolve(this._apiGateway.queryMethod(info.restApiId, info.resourceId, info.httpMethod))
            .then(result => {
                if (!result) {
                    return null;
                }
                result.restApiId = info.restApiId;
                result.resourceId = info.resourceId;
                result.path = info.path;
                return result;
            });
    }

    createMethod(info)
    {
        return this._apiGateway.createMethod(info.restApiId, info.resourceId, info.httpMethod)
            .then(result => {
                result.restApiId = info.restApiId;
                result.resourceId = info.resourceId;
                result.path = info.path;
                return result;
            });
    }
}

class ApiGatewayApi 
{
    constructor(helper, logger, apiGateway, data)
    {
        this._helper = helper;
        this._logger = logger;
        this._apiGateway = apiGateway;
        this._data = data;
        this._resources = [];
        this._methods = [];
        this._stages = [];
        this._authorizers = {};
    }

    get data() {
        return this._data;
    }

    get id() {
        return this._data.id;
    }

    get resources() {
        return this._resources;
    }
    
    get methods() {
        return this._methods;
    }

    get stages() {
        return this._stages;
    }

    get authorizers() {
        return _.values(this._authorizers);
    }

    getAuthorizer(id) {
        return this._authorizers[id];
    }

    refresh()
    {
        this._resources = [];
        this._methods = [];
        this._stages = [];
        this._authorizers = {};
        return Promise.resolve()
            .then(() => this._helper.queryApiResources(this.id))
            .then(result => {
                this._resources = result;
            })
            .then(() => {
                return Promise.serial(this._resources, x => this._refreshResource(x));
            })
            .then(() => this._queryAuthorizers())
            .then(() => this._queryStages())
            ;
    }

    _refreshResource(resourceInfo)
    {
        var methods = _.keys(resourceInfo.resourceMethods);
        if (!methods) {
            return;
        }
        return Promise.serial(methods, x => this._loadResourceMethod(resourceInfo, x));
    }

    _loadResourceMethod(resourceInfo, method)
    {
        return this._helper.queryMethod({restApiId: resourceInfo.restApiId, 
                                         resourceId: resourceInfo.id, 
                                         path: resourceInfo.path, 
                                         httpMethod: method })
            .then(result => {
                if (result) {
                    this._methods.push(result);
                }
            });
    }

    _queryStages()
    {
        return this._helper.queryStages(this.id)
            .then(result => {
                this._stages = result;
            })
    }

    _queryAuthorizers()
    {
        return this._helper.queryAuthorizers(this.id)
            .then(result => {
                this._authorizers = _.makeDict(result, x => x.id, x => x);
            })
    }
}

module.exports = ApiGatewayHelper;