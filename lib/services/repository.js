const Promise = require('the-promise');
const _ = require('lodash');
const shell = require('shelljs');

class AWSRepositoryClient
{
    constructor(parent)
    {
        this._parent = parent;
        this._logger = parent._logger;
        this._ecr = parent._ecr;
    }

    fetch(createIfNotPresent, name)
    {
        this._logger.verbose('Fetching Repository %s...', name);

        return this.query(name)
            .then(result => {
                if (!createIfNotPresent || result) {
                    return result;
                } else {
                    return this.create(name);
                }
            })
            .then(result => {
                this._logger.debug('Fetched Repository. %s', '', result);
                return result;
            });
    }

    create(name)
    {
        var params = {
            repositoryName: name
        };
        this._logger.info('Creating Repository %s...', params.repositoryName);
        this._logger.verbose('Creating Repository... %s', '', params);
        return this._ecr.createRepository(params).promise()
            .then(result => {
                var repo = result.repository;
                return repo;
            });
    }

    query(name) {
        var params = {
            repositoryNames: [
                name
            ]
        };
        return this._ecr.describeRepositories(params).promise()
            .then(result => {
                if (result.repositories.length == 0) {
                    return null;
                }
                var repo = result.repositories[0];
                return repo;
            })
            .then(repo => this._getImageInfo(repo))
            .catch(reason => {
                this._logger.error('Repository query error %s', '', reason);
                return null;
            });
    }

    _getImageInfo(repo)
    {
        if (!repo) {
            return null;
        }

        var params = {
            imageIds: [
                {
                    imageTag: "latest"
                }
            ],
            repositoryName: repo.repositoryName
        };
        return this._ecr.batchGetImage(params).promise()
            .then(result => {
                repo.images = result.images;
                var latestImage = _.find(result.images, x => x.imageId.imageTag == 'latest');
                if (latestImage) {
                    repo.latestImageDigest = latestImage.imageId.imageDigest;
                }
                return repo;
            });
    }

    queryAll(cluster, res, next) {
        if (!res) {
            res = [];
        }
        var params = {
            nextToken: next
        };
        return this._ecr.describeRepositories(params).promise()
            .then(result => {
                res = res.concat(result.repositories.filter(x => _.startsWith(x.repositoryName, cluster + '-')));
                if (result.nextToken) {
                    return queryAll(cluster, res, result.nextToken);
                }
                return res;
            })
            .then(result => Promise.serial(result, x => this._getImageInfo(x)));
    }

    pushImage(repo, name) {
        return Promise.resolve()
            .then(() => this._execShell('aws ecr get-login --no-include-email --region ' + this._parent.region))
            .then(result => this._performLogin(result.stdout))
            .then(() => this._execShell('docker tag ' + name + ':latest ' + repo.repositoryUri + ':latest'))
            .then(() => this._execShell('docker push ' + repo.repositoryUri + ':latest'));
    }

    _performLogin(command)
    {
        return Promise.retry(() => {
            return this._execShell(command);
        }, 3, 5000);
    }

    _execShell(command) {
        return new Promise((resolve, reject) => {
            this._logger.info('RUNNING: ' + command);
            var result = shell.exec(command);
            this._logger.info('EXIT CODE: ' + result.code);
            if (result.code == 0) {
                resolve(result);
            }
            else {
                var errStr = 'ErrorCode: ' + result.code;
                if (result.stderr) {
                    errStr = errStr + ' ERR: ' + result.stderr;
                }
                if (result.stdout) {
                    errStr = errStr + ' OUT: ' + result.stdout;
                }
                reject(errStr);
            }
        });
    }
}

module.exports = AWSRepositoryClient;