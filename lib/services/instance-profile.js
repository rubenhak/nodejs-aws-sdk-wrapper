const Promise = require('the-promise');
const _ = require('lodash');

class AWSInstanceProfileClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._iam = parent.getAwsService('iam');
    }

    queryAll(path, marker, result)
    {
        if (!result) {
            result = [];
        }

        var params = {
            PathPrefix: path,
            Marker: marker
        };
        this.logger.verbose('Query InstanceProfiles %s...',  path);
        return this._iam.listInstanceProfiles(params)
            .then(data => {
                return data.InstanceProfiles;
            });
    }

    query(name)
    {
        var params = {
            InstanceProfileName: name
        };
        this.logger.verbose('Query InstanceProfile %s...',  name, params);
        return this._iam.getInstanceProfile(params)
            .then(data => {
                return data.InstanceProfile;
            });
    }

    create(name, path)
    {
        var params = {
            InstanceProfileName: name,
            Path: path
        };
        this.logger.info('Creating InstanceProfile %s...',  name);
        this.logger.verbose('Creating InstanceProfile %s...',  name, params);
        return this._iam.createInstanceProfile(params)
            .then(data => {
                this.logger.verbose('Created InstanceProfile %s...',  name, data);
                return data.InstanceProfile;
            });
    }

    delete(name)
    {
        var params = {
            InstanceProfileName: name
        };
        this.logger.info('Deleting InstanceProfile %s...',  name);
        return this._iam.deleteInstanceProfile(params)
            .then(data => {
                this.logger.verbose('Deleted InstanceProfile %s...',  name);
            });
    }

    addRole(name, roleName)
    {
        var params = {
            InstanceProfileName: name,
            RoleName: roleName
        };
        this.logger.info('Adding Role %s to %s...', roleName, name);
        return this._iam.addRoleToInstanceProfile(params)
            .then(data => {
                this.logger.verbose('Role added to instance profile.', data);
            });
    }

    removeRole(name, roleName)
    {
        var params = {
            InstanceProfileName: name,
            RoleName: roleName
        };
        this.logger.info('Removing Role %s from %s...', roleName, name);
        return this._iam.removeRoleFromInstanceProfile(params)
            .then(data => {
                this.logger.verbose('Role removed from instance profile.', data);
            });
    }

}

module.exports = AWSInstanceProfileClient;
