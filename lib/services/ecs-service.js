const Promise = require('the-promise');
const _ = require('the-lodash');

class AWSEcsServiceClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ecs = parent.getAwsService('ecs');
    }

    query(clusterName, arn) {
        return this._ecs.describeServices({ cluster: clusterName, services: [arn] })
            .then(data => {
                if (data.services.length > 0) {
                    var service = data.services[0];
                    this.logger.silly('Queried EcsService. %s', '', service);
                    return service;
                }
                return null;
            })
    }
 
    queryAllForCluster(clusterName, nextToken, results)
    {
        if (!results) {
            results = []
        }
        var params = {
            cluster: clusterName
        }
        if (nextToken) {
            params.nextToken = nextToken
        }
        return this._ecs.listServices(params)
            .then(data => Promise.serial(data.serviceArns, x => this.query(clusterName, x)))
            .then(data => {
                results = results.concat(data);
                if (data.nextToken) {
                    return this.queryAllForCluster(clusterName, data.nextToken, results);
                } else {
                    return results;
                }
            })
            .catch(reason => {
                if (reason.code == 'ClusterNotFoundException') {
                    return results;
                } else {
                    throw reason;
                }
            });
    }

    create(serviceName, clusterName, params)
    {
        if (!params) {
            params = {};
        } else {
            params = _.clone(params);
        }
        params.serviceName = serviceName;
        params.cluster = clusterName;

        this.logger.info('Creating service %s::%s...', clusterName, serviceName);
        this.logger.verbose('Starting service... %s', '', params);
        return this._ecs.createService(params)
            .then(data => {
                this.logger.verbose('Service Create Result:', data);
                return data.service;
            });
    }
    
    update(serviceName, clusterName, params)
    {
        if (!params) {
            params = {};
        } else {
            params = _.clone(params);
        }
        params.service = serviceName;
        params.cluster = clusterName;

        this.logger.info('Updating service %s::%s...', clusterName, serviceName);
        this.logger.verbose('Updating service... %s', '', params);
        return this._ecs.updateService(params)
            .then(data => {
                this.logger.verbose('Service Update Result:', data);
                return data.service;
            });
    }
    
    delete(serviceName, clusterName)
    {
        var params = {};
        params.service = serviceName;
        params.cluster = clusterName;

        this.logger.info('Deleting service %s::%s...', clusterName, serviceName);
        this.logger.verbose('Deleting service... %s', '', params);
        return this._ecs.deleteService(params)
            .then(data => {
                this.logger.verbose('Service Delete Result:', data);
                return data.service;
            });
    }
}

module.exports = AWSEcsServiceClient;
