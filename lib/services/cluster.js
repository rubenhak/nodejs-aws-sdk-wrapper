const _ = require('the-lodash');
const Promise = require('the-promise');

class AWSClusterClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ecs = parent.getAwsService('ecs');
    }

    fetch(createIfNotPresent, name)
    {
        this.logger.verbose('Fetching cluster %s...',  name);
        return this.query(name)
            .then(cluster => {
                if (!createIfNotPresent || cluster) {
                    return cluster;
                } else {
                    return this.create(name);
                }
            })
            .then(cluster => {
                this.logger.debug('Fetched cluster %s',  '', cluster);
                return cluster;
            });
    }

    queryAll(prefix)
    {
        this.logger.verbose('queryAll Cluster %s...',  prefix);
        return this.queryNames(prefix)
            .then(names => {
                this.logger.silly('Cluster::QueryAll names %s...', names);
                return Promise.serial(names, x => this.query(x));
            });
    }

    queryNames(prefix, nextToken, results)
    {
        if (!results) {
            results = []
        }
        var params = {};
        if (nextToken) {
            params.nextToken = nextToken;
        }
        return this._ecs.listClusters(params)
            .then(data => {
                if(data.clusterArns) {
                    for(var arn of data.clusterArns) {
                        var name = this.parent.shortenArn(arn);
                        if (prefix) {
                            if (!_.startsWith(name, prefix)) {
                                continue;
                            }
                        }
                        results.push(name);
                    }
                }
                if (data.nextToken) {
                    return this.queryNames(prefix, data.nextToken, results);
                } else {
                    return results;
                }
            });
    }

    query(name)
    {
        return this._ecs.describeClusters({ clusters: [name] })
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
        this.logger.info('Creating cluster %s', params.clusterName);
        this.logger.verbose('Creating cluster %s', '', params);
        return this._ecs.createCluster(params)
            .then(data => {
                var cluster = data.cluster;
                this.logger.verbose('Cluster created %s', '', cluster);
                return cluster;
            });
    }

    delete(clusterName) {
        var params = {
            cluster: clusterName
        };
        this.logger.info('Deleting Cluster %s...', clusterName);
        return this._ecs.deleteCluster(params)
            .then(result => {
                return null;
            });
    }

}

module.exports = AWSClusterClient;
