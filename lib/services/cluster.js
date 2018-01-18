const _ = require('lodash');

class AWSClusterClient
{
    constructor(parent)
    {
        this._parent = parent;
        this._logger = parent._logger;
        this._ecs = parent._ecs;
    }

    fetch(createIfNotPresent, name)
    {
        this._logger.verbose('Fetching cluster %s...',  name);
        return this.query(name)
            .then(cluster => {
                if (!createIfNotPresent || cluster) {
                    return cluster;
                } else {
                    return this.create(name);
                }
            })
            .then(cluster => {
                this._logger.debug('Fetched cluster %s',  '', cluster);
                return cluster;
            });
    }

    queryAll(name)
    {
        this._logger.verbose('queryAll Cluster %s...',  name);
        return this._ecs.describeClusters({ clusters: [name] }).promise()
            .then(data => {
                this._logger.silly('Cluster::QueryAll %s...',  name, data);

                if(data.clusters.length == 0) {
                    return [];
                }
                var cluster = data.clusters[0];
                if (cluster.status != 'ACTIVE')
                    return [];
                return [cluster];
            });
    }

    query(name)
    {
        return this._ecs.describeClusters({ clusters: [name] }).promise()
            .then(data => {
                if(data.clusters.length == 0) {
                    return null;
                }
                var cluster = data.clusters[0];
                if (cluster.status != 'ACTIVE')
                    return null;
                return cluster;
            });
    }

    create(name)
    {
        var params = { clusterName: name };
        this._logger.info('Creating cluster %s', params.clusterName);
        this._logger.verbose('Creating cluster %s', '', params);
        return this._ecs.createCluster(params).promise()
            .then(data => {
                var cluster = data.cluster;
                this._logger.verbose('Cluster created %s', '', cluster);
                return cluster;
            });
    }

    delete(clusterName) {
        var params = {
            cluster: clusterName
        };
        this._logger.info('Deleting Cluster %s...', clusterName);
        return this._ecs.deleteCluster(params).promise()
            .then(result => {
                return null;
            });
    }

}

module.exports = AWSClusterClient;
