const Promise = require('the-promise');
const _ = require('the-lodash');
const shell = require('rubenhak-shelljs');

class AWSRepositoryClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ecr = parent.getAwsService('ecr');
    }

    fetch(name)
    {
        this.logger.verbose('Fetching Repository %s...', name);
        return this.query(name)
            .then(result => {
                if (result) {
                    return result;
                } else {
                    return this.create(name);
                }
            })
            .then(result => {
                this.logger.debug('Fetched Repository. %s', '', result);
                return result;
            });
    }

    create(name)
    {
        var params = {
            repositoryName: name
        };
        this.logger.info('Creating Repository %s...', params.repositoryName);
        this.logger.verbose('Creating Repository... %s', '', params);
        return this._ecr.createRepository(params)
            .then(result => {
                this.logger.verbose('Repository Create Result: ', result);
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
        return this._ecr.describeRepositories(params)
            .then(result => {
                if (result.repositories.length == 0) {
                    return null;
                }
                var repo = result.repositories[0];
                return repo;
            })
            .then(repo => this._getImageInfo(repo))
            .catch(reason => {
                if(reason.code == 'RepositoryNotFoundException') {
                    return null;
                }
                this.logger.error('Repository query error %s', '', reason);
                throw reason;
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
        return this._ecr.batchGetImage(params)
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
        return this._ecr.describeRepositories(params)
            .then(result => {
                res = res.concat(result.repositories.filter(x => _.startsWith(x.repositoryName, cluster + '-')));
                if (result.nextToken) {
                    return queryAll(cluster, res, result.nextToken);
                }
                return res;
            })
            .then(result => Promise.serial(result, x => this._getImageInfo(x)));
    }

    getAuthToken()
    {
        var params = {
        };
        return this._ecr.getAuthorizationToken()
            .then(data => {
                if (!data) {
                    return null;
                }
                if (!_.isArray(data.authorizationData)) {
                    return null;
                }
                var token = data.authorizationData[0];
                token.authorizationToken = new Buffer(token.authorizationToken, 'base64').toString();
                token.authorizationToken = token.authorizationToken.replace('AWS:', '');
                return token;
            });
    }

    getDockerLoginCommand()
    {
        return this.getAuthToken()
            .then(token => {
                return 'docker login -u AWS -p ' +  token.authorizationToken + ' ' + token.proxyEndpoint;
            })
    }

    pushImage(repo, name) {
        return Promise.resolve()
            .then(() => this.getDockerLoginCommand())
            .then(dockerCommand => this._performLogin(dockerCommand))
            .then(() => this._execShell('docker tag ' + name + ':latest ' + repo.repositoryUri + ':latest'))
            .then(() => this._execShell('docker push ' + repo.repositoryUri + ':latest'))
            .then(result => {
                var re = /(sha256:\S+)/g;
                var found = result.stdout.match(re);
                if (found.length != 1) {
                    throw new Error('Cound not fetch the digest for repository: %s', name);
                }
                return {
                    code: result.code,
                    digest: found[0]
                };
            });
    }

    _performLogin(command)
    {
        return Promise.retry(() => {
            return this._execShell(command);
        }, 3, 5000);
    }

    _execShell(command, credentials) {
        return new Promise((resolve, reject) => {
            this.logger.info('RUNNING: ' + command);
            shell.exec(command, { async: true, envOverride: credentials },
                (code, stdout, stderr) => {
                    var result = {
                        code: code, stdout: stdout, stderr: stderr
                    }
                    this.logger.info('EXIT CODE: ' + result.code);
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
        });
    }
}

module.exports = AWSRepositoryClient;
