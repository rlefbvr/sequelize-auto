const Sequelize = require('sequelize');
const path = require('path');
const config = require(path.join(__dirname, 'config'));
const fs = require('fs');

module.exports = {
  Sequelize: Sequelize,

  initTestData: function (test, dialect, done) {
    helpers = this;
    this.initTests({
      dialect: dialect,
      beforeComplete: function (sequelize) {
        test.sequelize = sequelize;
        test.User = test.sequelize.define('User', {
          username: { type: Sequelize.STRING },
          touchedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
          aNumber: { type: Sequelize.INTEGER },
          bNumber: { type: Sequelize.INTEGER, comment: 'B Number' },
          validateTest: {
            type: Sequelize.INTEGER,
            allowNull: true
          },
          validateCustom: {
            type: Sequelize.STRING,
            allowNull: false
          },
          dateAllowNullTrue: {
            type: Sequelize.DATE,
            allowNull: true
          },
          defaultValueBoolean: {
            type: Sequelize.BOOLEAN,
            defaultValue: true
          }
        });

        test.HistoryLog = test.sequelize.define('HistoryLog', {
          'some Text': { type: Sequelize.STRING },
          '1Number': { type: Sequelize.INTEGER },
          aRandomId: { type: Sequelize.INTEGER }
        });

        test.ParanoidUser = test.sequelize.define(
          'ParanoidUser',
          {
            username: { type: Sequelize.STRING }
          },
          {
            paranoid: true
          }
        );

        test.ParanoidUser.belongsTo(test.User);
      },
      onComplete: function () {
        test.sequelize.sync().then(function () {
          var trigger = helpers.getDummyCreateTriggerStatement("HistoryLogs");
          test.sequelize.query(trigger).then(function (_) {
            done();
          }, done);
        }, done);
      },
      onError: done
    });
  },

  initTests: function (options) {
    if (!options || !options.onError || !options.onComplete) {
      throw new Error("options.onComplete+onError required");
    }

    try {
      const sequelize = this.createSequelizeInstance(options);

      this.clearDatabase(sequelize, function(err) {
        if (err) {
          return options.onError(err);
        }
        try {
          if (options.context) {
            options.context.sequelize = sequelize;
          }
          if (options.beforeComplete) {
            options.beforeComplete(sequelize);
          }
          options.onComplete(sequelize);
        } catch (err) {
          return options.onError(err);
        }
      });
    }
    catch (err) {
      return options.onError(err);
    }
  },

  createSequelizeInstance: function(options) {
    options = options || {};
    options.dialect = options.dialect || 'mysql';
    options.logging = options.hasOwnProperty('logging') ? options.logging : false;

    const sequelizeOptions = {
      logging: options.logging,
      dialect: options.dialect,
      host: config[options.dialect].host,
      port: config[options.dialect].port
    };

    if (config[options.dialect] && config[options.dialect].storage) {
      sequelizeOptions.storage = config[options.dialect].storage;
    }

    if (process.env.DIALECT === 'postgres-native') {
      sequelizeOptions.native = true;
    }

    if (process.env.DIALECT === 'mssql') {
      // set defaults for tedious, to silence the warnings
      sequelizeOptions.dialectOptions = { options: { trustServerCertificate: true, enableArithAbort: true }};
    }

    return new Sequelize(
      config[options.dialect].database,
      config[options.dialect].username,
      config[options.dialect].password,
      sequelizeOptions
    );
  },

  clearDatabase: function(sequelize, callback) {
    if (!sequelize) {
      return callback && callback();
    }

    function success() {
      fs.readdir(config.directory, function(err, files) {
        if (err || !files || files.length < 1) {
          return callback && callback();
        }

        files.forEach(function(file) {
          const fileName = path.join(config.directory, file);
          const stat = fs.statSync(fileName);
          if (stat.isFile()) {
            fs.unlinkSync(fileName);
          }
        });
        callback && callback();
      });
    }

    function error(err) {
      callback && callback(err);
    }

    try {
      sequelize
        .getQueryInterface()
        .dropAllTables()
        .then(success, error);
    } catch(ex) {
      callback && callback(ex);
    }
  },

  getSupportedDialects: function() {
    return fs
      .readdirSync(path.join(__dirname, '..', 'node_modules', 'sequelize', 'lib', 'dialects'))
      .filter(function(file) {
        return file.indexOf('.js') === -1 && file.indexOf('abstract') === -1;
      });
  },

  getTestDialect: function() {
    let envDialect = process.env.DIALECT || 'mysql';
    if (envDialect === 'postgres-native') {
      envDialect = 'postgres';
    }

    if (this.getSupportedDialects().indexOf(envDialect) === -1) {
      throw new Error('The dialect you have passed is unknown. Did you really mean: ' + envDialect);
    }
    return envDialect;
  },

  getTestDialectTeaser: function(moduleName) {
    let dialect = this.getTestDialect();
    if (process.env.DIALECT === 'postgres-native') {
      dialect = 'postgres-native';
    }
    return `[${dialect.toUpperCase()}] ${moduleName}`;
  },

  checkMatchForDialects: function(dialect, value, expectations) {
    if (expectations.hasOwnProperty(dialect)) {
      expect(value).toMatch(expectations[dialect]);
    } else {
      throw new Error(`Undefined expectation for "${dialect}"!`);
    }
  },
  getDummyCreateTriggerStatement: function(tableName) {
    var statement = {
      mysql:    'CREATE TRIGGER ' + tableName + '_Trigger BEFORE INSERT ON ' + tableName + ' FOR EACH ROW SET NEW.Id = NEW.Id',
      postgres: 'CREATE OR REPLACE FUNCTION blah() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql; \
                 CREATE TRIGGER "' + tableName + '_Trigger" AFTER INSERT ON "' + tableName + '" WHEN (1=0) EXECUTE PROCEDURE blah(1);',
      mssql:    'CREATE TRIGGER ' + tableName + '_Trigger ON ' + tableName + ' AFTER INSERT AS BEGIN SELECT 1 WHERE 1=0; END;',
      sqlite:   'CREATE TRIGGER IF NOT EXISTS ' + tableName + '_Trigger AFTER INSERT ON ' + tableName + ' BEGIN SELECT 1 WHERE 1=0; END;'
    }[this.getTestDialect()];

    if (statement) return statement;

    throw new Error("CREATE TRIGGER not set for dialect " + this.getTestDialect());
  }
};
