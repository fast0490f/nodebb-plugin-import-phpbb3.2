'use strict';

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

var async = require('async');
var mysql = require('mysql');
var _ = require('lodash/fp');
var noop = function noop() {};
var logPrefix = '[nodebb-plugin-import-phpbb3.2]';
const http = require('http');
const process = require('process');
const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');

const Exporter = module.exports;

const fixBB = bb => {
  const fixed = bb.replace(/<s>([\w\W]*?)<\/s>/mig, '$1').replace(/<e>([\w\W]*?)<\/e>/mig, '$1').replace(/<U>([\w\W]*?)<\/U>/mig, '$1').replace(/<B>([\w\W]*?)<\/B>/mig, '$1').replace(/<r>([\w\W]*?)<\/r>/mig, '$1').replace(/<t>([\w\W]*?)<\/t>/mig, '$1').replace(/<quote.*?>([\w\W]*)<\/quote>/mig, '$1').replace(/<quote.*?>([\w\W]*)<\/quote>/mig, '$1').replace(/<quote.*?>([\w\W]*)<\/quote>/mig, '$1').replace(/<color.+?>([\w\W]*?)<\/color>/mig, '$1').replace(/<link_text.+?>([\w\W]*?)<\/link_text>/mig, '$1').replace(/<url.+?>([\w\W]*?)<\/url>/mig, '$1').replace(/<emoji.+?>([\w\W]*?)<\/emoji>/mig, '$1').replace(/<attachment.+?>([\w\W]*?)<\/attachment>/mig, '$1').replace(/<!--[^>]+-->/, ''); // html comment
  return fixed;
};

const getFile = (url, output) => new Promise((resolve, reject) => {
  const dest = path.join(process.cwd(), 'public', 'uploads', 'phpbb', output);
  mkdirp(path.dirname(dest), function (err) {
    if (err) return reject(err);

    Exporter.log('Downloading', url, 'to', dest);

    var file = fs.createWriteStream(dest);
    var request = http.get(url, function (response) {
      response.pipe(file);
      file.on('finish', function () {
        file.close(resolve);
      });
    }).on('error', function (err) {
      fs.unlink(dest);
      reject(err.message);
    });
  });
});

const executeQuery = query => new Promise((resolve, reject) => {
  Exporter.connection.query(query, (err, rows) => {
    if (err) return reject(err);
    resolve(rows);
  });
});

Exporter.setup = config => {
  Exporter.log('setup');

  var _config = {
    host: config.dbhost || config.host || 'localhost',
    user: config.dbuser || config.user || 'root',
    password: config.dbpass || config.pass || config.password || '',
    port: config.dbport || config.port || 3306,
    database: config.dbname || config.name || config.database || 'phpbb',
    attachment_url: config.custom ? config.custom.attachment_url : false
  };

  Exporter.config(_config);
  Exporter.config('prefix', config.prefix || config.tablePrefix || '' /* phpbb_ ? */);

  Exporter.connection = mysql.createConnection(_config);
  Exporter.connection.connect();

  return Exporter.config();
};

Exporter.getPaginatedUsers = (() => {
  var _ref = _asyncToGenerator(function* (start, limit) {
    Exporter.log('getPaginatedUsers');
    var err;
    var prefix = Exporter.config('prefix');
    var startms = +new Date();
    var query = 'SELECT ' + prefix + 'users.user_id as _uid, ' + prefix + 'users.username as _username, ' + prefix + 'users.username_clean as _alternativeUsername, ' + prefix + 'users.user_email as _registrationEmail, '
    //+ prefix + 'users.user_rank as _level, '
    + prefix + 'users.user_regdate as _joindate, ' + prefix + 'users.user_posts as _post_count, ' + prefix + 'users.user_email as _email '
    //+ prefix + 'banlist.ban_id as _banned '
    //+ prefix + 'USER_PROFILE.USER_SIGNATURE as _signature, '
    //+ prefix + 'USER_PROFILE.USER_HOMEPAGE as _website, '
    //+ prefix + 'USER_PROFILE.USER_OCCUPATION as _occupation, '
    //+ prefix + 'USER_PROFILE.USER_LOCATION as _location, '
    //+ prefix + 'USER_PROFILE.USER_AVATAR as _picture, '
    //+ prefix + 'USER_PROFILE.USER_TITLE as _title, '
    //+ prefix + 'USER_PROFILE.USER_RATING as _reputation, '
    //+ prefix + 'USER_PROFILE.USER_TOTAL_RATES as _profileviews, '
    //+ prefix + 'USER_PROFILE.USER_BIRTHDAY as _birthday '

    + 'FROM ' + prefix + 'users ' + 'WHERE ' + prefix + 'users.user_id = ' + prefix + 'users.user_id ' + (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');

    if (!Exporter.connection) {
      err = { error: 'MySQL connection is not setup. Run setup(config) first' };
      Exporter.error(err.error);
      throw err;
    }

    let rows = yield executeQuery(query);
    rows = rows.filter(function (r) {
      return r._post_count > 0;
    });

    //normalize here
    var map = {};
    rows.forEach(function (row) {
      // nbb forces signatures to be less than 150 chars
      // keeping it HTML see https://github.com/akhoury/nodebb-plugin-import#markdown-note
      row._signature = Exporter.truncateStr(row._signature || '', 150);

      // from unix timestamp (s) to JS timestamp (ms)
      row._joindate = (row._joindate || 0) * 1000 || startms;

      // lower case the email for consistency
      row._email = (row._email || '').toLowerCase();

      // I don't know about you about I noticed a lot my users have incomplete urls, urls like: http://
      row._picture = Exporter.validateUrl(row._picture);
      row._website = Exporter.validateUrl(row._website);

      map[row._uid] = row;
    });

    return map;
  });

  return function (_x, _x2) {
    return _ref.apply(this, arguments);
  };
})();

Exporter.getPaginatedCategories = (() => {
  var _ref2 = _asyncToGenerator(function* (start, limit) {
    Exporter.log('getPaginatedCategories');
    var err;
    var prefix = Exporter.config('prefix');
    var startms = +new Date();
    var query = 'SELECT ' + prefix + 'forums.forum_id as _cid, ' + prefix + 'forums.forum_name as _name, ' + prefix + 'forums.forum_desc as _description, ' + prefix + 'forums.forum_parents as _parentCid ' + 'FROM ' + prefix + 'forums ' + (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');

    if (!Exporter.connection) {
      err = { error: 'MySQL connection is not setup. Run setup(config) first' };
      Exporter.error(err.error);
      throw err;
    }

    const rows = yield executeQuery(query);

    //normalize here
    var map = {};
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = rows[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        const row = _step.value;

        row._name = row._name || 'Untitled Category';
        row._description = row._description || '';
        row._timestamp = (row._timestamp || 0) * 1000 || startms;
        try {
          row._parentCid = Number(row._parentCid.split(':')[3].split(';')[0]);
        } catch (e) {
          row._parentCid = undefined;
        }

        map[row._cid] = row;
      }
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator.return) {
          _iterator.return();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }

    return map;
  });

  return function (_x3, _x4) {
    return _ref2.apply(this, arguments);
  };
})();

const processAttachments = (() => {
  var _ref3 = _asyncToGenerator(function* (content, pid) {
    const prefix = Exporter.config('prefix');
    let attachments = (yield executeQuery(`
		SELECT * FROM ${prefix}attachments WHERE post_msg_id = ${pid}
	`)).map(function (a) {
      return {
        orig_filename: a.real_filename,
        url: "/uploads/phpbb/" + a.physical_filename
      };
    });
    console.log('processing', attachments);
    const temp = [];
    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
      for (var _iterator2 = attachments[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
        const att = _step2.value;

        if (content.indexOf(att.orig_filename) === -1) {
          temp.push(`![${att.orig_filename}](${att.url})`);
        }
        content = content.replace(new RegExp(`\\[attachment.+\\]${att.orig_filename}\\[/attachment\\]`, 'g'), `![${att.orig_filename}](${att.url})`);
      }
    } catch (err) {
      _didIteratorError2 = true;
      _iteratorError2 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion2 && _iterator2.return) {
          _iterator2.return();
        }
      } finally {
        if (_didIteratorError2) {
          throw _iteratorError2;
        }
      }
    }

    if (temp.length > 0) {
      return content + '\n' + temp.join('\n');
    }
    return content;
  });

  return function processAttachments(_x5, _x6) {
    return _ref3.apply(this, arguments);
  };
})();

Exporter.getPaginatedTopics = (() => {
  var _ref4 = _asyncToGenerator(function* (start, limit) {
    Exporter.log('getPaginatedTopics');
    var err;
    var prefix = Exporter.config('prefix');
    var startms = +new Date();
    var query = 'SELECT ' + prefix + 'topics.topic_id as _tid, ' + prefix + 'topics.forum_id as _cid, '

    // this is the 'parent-post'
    // see https://github.com/akhoury/nodebb-plugin-import#important-note-on-topics-and-posts
    // I don't really need it since I just do a simple join and get its content, but I will include for the reference
    // remember this post EXCLUDED in the exportPosts() function
    + prefix + 'topics.topic_first_post_id as _pid, ' + prefix + 'topics.topic_views as _viewcount, ' + prefix + 'topics.topic_title as _title, ' + prefix + 'topics.topic_time as _timestamp, '

    // maybe use that to skip
    // + prefix + 'topics.topic_approved as _approved, '

    + prefix + 'topics.topic_status as _status, '

    //+ prefix + 'TOPICS.TOPIC_IS_STICKY as _pinned, '
    + prefix + 'posts.poster_id as _uid, '
    // this should be == to the _tid on top of this query
    + prefix + 'posts.topic_id as _post_tid, '

    // and there is the content I need !!
    + prefix + 'posts.post_text as _content ' + 'FROM ' + prefix + 'topics, ' + prefix + 'posts '
    // see
    + 'WHERE ' + prefix + 'topics.topic_first_post_id=' + prefix + 'posts.post_id ' + (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');

    if (!Exporter.connection) {
      err = { error: 'MySQL connection is not setup. Run setup(config) first' };
      Exporter.error(err.error);
      throw err;
    }

    const rows = yield executeQuery(query);
    console.log('rows', rows);

    //normalize here
    var map = {};
    let topicCount = 0;
    var _iteratorNormalCompletion3 = true;
    var _didIteratorError3 = false;
    var _iteratorError3 = undefined;

    try {
      for (var _iterator3 = rows[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
        const row = _step3.value;

        topicCount++;
        Exporter.log(`Topic ${topicCount} out of ${rows.length}`);
        row._content = fixBB(row._content);
        row._content = yield processAttachments(row._content, row._pid);
        console.log(row);

        row._title = row._title ? row._title[0].toUpperCase() + row._title.substr(1) : 'Untitled';
        row._timestamp = (row._timestamp || 0) * 1000 || startms;

        map[row._tid] = row;
      }
    } catch (err) {
      _didIteratorError3 = true;
      _iteratorError3 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion3 && _iterator3.return) {
          _iterator3.return();
        }
      } finally {
        if (_didIteratorError3) {
          throw _iteratorError3;
        }
      }
    }

    return map;
  });

  return function (_x7, _x8) {
    return _ref4.apply(this, arguments);
  };
})();

var getTopicsMainPids = (() => {
  var _ref5 = _asyncToGenerator(function* () {
    if (Exporter._topicsMainPids) {
      return Exporter._topicsMainPids;
    }
    const topicsMap = yield Exporter.getPaginatedTopics(0, -1);

    Exporter._topicsMainPids = {};
    Object.keys(topicsMap).forEach(function (_tid) {
      var topic = topicsMap[_tid];
      Exporter._topicsMainPids[topic._pid] = topic._tid;
    });
    return Exporter._topicsMainPids;
  });

  return function getTopicsMainPids() {
    return _ref5.apply(this, arguments);
  };
})();

(() => {
  let attachmentsDownloaded = false;
  Exporter.downloadAttachments = _asyncToGenerator(function* () {
    if (!Exporter.config().attachment_url) return;
    if (attachmentsDownloaded) return;
    attachmentsDownloaded = true;
    Exporter.log('Downloading attachments');
    const prefix = Exporter.config('prefix');

    const attachments = yield executeQuery(`
			SELECT * FROM ${prefix}attachments
		`);
    yield Promise.all(attachments.map((() => {
      var _ref7 = _asyncToGenerator(function* (a) {
        return getFile(Exporter.config().attachment_url + a.physical_filename, a.attach_id + '_' + a.real_filename);
      });

      return function (_x9) {
        return _ref7.apply(this, arguments);
      };
    })()));
  });
})();

Exporter.getPaginatedPosts = (() => {
  var _ref8 = _asyncToGenerator(function* (start, limit) {
    Exporter.log('getPaginatedPosts');
    yield Exporter.downloadAttachments();
    var err;
    var prefix = Exporter.config('prefix');
    var startms = +new Date();
    var query = 'SELECT ' + prefix + 'posts.post_id as _pid, '
    //+ 'POST_PARENT_ID as _post_replying_to, ' phpbb doesn't have "reply to another post"
    + prefix + 'posts.topic_id as _tid, ' + prefix + 'posts.post_time as _timestamp, '
    // not being used
    + prefix + 'posts.post_subject as _subject, ' + prefix + 'posts.post_text as _content, ' + prefix + 'posts.poster_id as _uid '

    // maybe use this one to skip
    //+ prefix + 'posts.post_approved as _approved '

    + 'FROM ' + prefix + 'posts '

    // the ones that are topics main posts are filtered below
    + 'WHERE ' + prefix + 'posts.topic_id > 0 ' + (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');

    if (!Exporter.connection) {
      err = { error: 'MySQL connection is not setup. Run setup(config) first' };
      Exporter.error(err.error);
      throw err;
    }

    const rows = yield executeQuery(query);
    const mpids = yield getTopicsMainPids();

    //normalize here
    var map = {};
    let currentPostNum = 0;
    var _iteratorNormalCompletion4 = true;
    var _didIteratorError4 = false;
    var _iteratorError4 = undefined;

    try {
      for (var _iterator4 = rows[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
        const row = _step4.value;

        currentPostNum++;
        Exporter.log(`Post ${currentPostNum} out of ${rows.length}`);
        // make it's not a topic
        if (!mpids[row._pid]) {
          row._content = fixBB(row._content);
          row._content = yield processAttachments(row._content, row._pid);
          row._timestamp = (row._timestamp || 0) * 1000 || startms;
          map[row._pid] = row;
        }
      }
    } catch (err) {
      _didIteratorError4 = true;
      _iteratorError4 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion4 && _iterator4.return) {
          _iterator4.return();
        }
      } finally {
        if (_didIteratorError4) {
          throw _iteratorError4;
        }
      }
    }

    return map;
  });

  return function (_x10, _x11) {
    return _ref8.apply(this, arguments);
  };
})();

Exporter.teardown = () => {
  Exporter.log('teardown');
  Exporter.connection.end();

  Exporter.log('Done');
};

Exporter.paginatedTestrun = (() => {
  var _ref9 = _asyncToGenerator(function* (config) {
    Exporter.setup(config);
    Exporter.getPaginatedUsers(0, 1000);
    Exporter.getPaginatedCategories(0, 1000);
    Exporter.getPaginatedTopics(0, 1000);
    Exporter.getPaginatedPosts(1001, 2000);
    Exporter.teardown();
  });

  return function (_x12) {
    return _ref9.apply(this, arguments);
  };
})();

Exporter.warn = function () {
  var args = _.toArray(arguments);
  args.unshift(logPrefix);
  console.warn.apply(console, args);
};

Exporter.log = function () {
  var args = _.toArray(arguments);
  args.unshift(logPrefix);
  console.log.apply(console, args);
};

Exporter.error = function () {
  var args = _.toArray(arguments);
  args.unshift(logPrefix);
  console.error.apply(console, args);
};

Exporter.config = function (config, val) {
  if (config != null) {
    if (typeof config === 'object') {
      Exporter._config = config;
    } else if (typeof config === 'string') {
      if (val != null) {
        Exporter._config = Exporter._config || {};
        Exporter._config[config] = val;
      }
      return Exporter._config[config];
    }
  }
  return Exporter._config;
};

// from Angular https://github.com/angular/angular.js/blob/master/src/ng/directive/input.js#L11
Exporter.validateUrl = function (url) {
  var pattern = /^(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?$/;
  return url && url.length < 2083 && url.match(pattern) ? url : '';
};

Exporter.truncateStr = function (str, len) {
  if (typeof str != 'string') return str;
  len = _.isNumber(len) && len > 3 ? len : 20;
  return str.length <= len ? str : str.substr(0, len - 3) + '...';
};

Exporter.whichIsFalsy = function (arr) {
  for (var i = 0; i < arr.length; i++) {
    if (!arr[i]) return i;
  }
  return null;
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9pbmRleC5qcyJdLCJuYW1lcyI6WyJhc3luYyIsInJlcXVpcmUiLCJteXNxbCIsIl8iLCJub29wIiwibG9nUHJlZml4IiwiaHR0cCIsInByb2Nlc3MiLCJwYXRoIiwiZnMiLCJta2RpcnAiLCJFeHBvcnRlciIsIm1vZHVsZSIsImV4cG9ydHMiLCJmaXhCQiIsImJiIiwiZml4ZWQiLCJyZXBsYWNlIiwiZ2V0RmlsZSIsInVybCIsIm91dHB1dCIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZGVzdCIsImpvaW4iLCJjd2QiLCJkaXJuYW1lIiwiZXJyIiwibG9nIiwiZmlsZSIsImNyZWF0ZVdyaXRlU3RyZWFtIiwicmVxdWVzdCIsImdldCIsInJlc3BvbnNlIiwicGlwZSIsIm9uIiwiY2xvc2UiLCJ1bmxpbmsiLCJtZXNzYWdlIiwiZXhlY3V0ZVF1ZXJ5IiwicXVlcnkiLCJjb25uZWN0aW9uIiwicm93cyIsInNldHVwIiwiY29uZmlnIiwiX2NvbmZpZyIsImhvc3QiLCJkYmhvc3QiLCJ1c2VyIiwiZGJ1c2VyIiwicGFzc3dvcmQiLCJkYnBhc3MiLCJwYXNzIiwicG9ydCIsImRicG9ydCIsImRhdGFiYXNlIiwiZGJuYW1lIiwibmFtZSIsImF0dGFjaG1lbnRfdXJsIiwiY3VzdG9tIiwicHJlZml4IiwidGFibGVQcmVmaXgiLCJjcmVhdGVDb25uZWN0aW9uIiwiY29ubmVjdCIsImdldFBhZ2luYXRlZFVzZXJzIiwic3RhcnQiLCJsaW1pdCIsInN0YXJ0bXMiLCJEYXRlIiwiZXJyb3IiLCJmaWx0ZXIiLCJyIiwiX3Bvc3RfY291bnQiLCJtYXAiLCJmb3JFYWNoIiwicm93IiwiX3NpZ25hdHVyZSIsInRydW5jYXRlU3RyIiwiX2pvaW5kYXRlIiwiX2VtYWlsIiwidG9Mb3dlckNhc2UiLCJfcGljdHVyZSIsInZhbGlkYXRlVXJsIiwiX3dlYnNpdGUiLCJfdWlkIiwiZ2V0UGFnaW5hdGVkQ2F0ZWdvcmllcyIsIl9uYW1lIiwiX2Rlc2NyaXB0aW9uIiwiX3RpbWVzdGFtcCIsIl9wYXJlbnRDaWQiLCJOdW1iZXIiLCJzcGxpdCIsImUiLCJ1bmRlZmluZWQiLCJfY2lkIiwicHJvY2Vzc0F0dGFjaG1lbnRzIiwiY29udGVudCIsInBpZCIsImF0dGFjaG1lbnRzIiwib3JpZ19maWxlbmFtZSIsImEiLCJyZWFsX2ZpbGVuYW1lIiwicGh5c2ljYWxfZmlsZW5hbWUiLCJjb25zb2xlIiwidGVtcCIsImF0dCIsImluZGV4T2YiLCJwdXNoIiwiUmVnRXhwIiwibGVuZ3RoIiwiZ2V0UGFnaW5hdGVkVG9waWNzIiwidG9waWNDb3VudCIsIl9jb250ZW50IiwiX3BpZCIsIl90aXRsZSIsInRvVXBwZXJDYXNlIiwic3Vic3RyIiwiX3RpZCIsImdldFRvcGljc01haW5QaWRzIiwiX3RvcGljc01haW5QaWRzIiwidG9waWNzTWFwIiwiT2JqZWN0Iiwia2V5cyIsInRvcGljIiwiYXR0YWNobWVudHNEb3dubG9hZGVkIiwiZG93bmxvYWRBdHRhY2htZW50cyIsImFsbCIsImF0dGFjaF9pZCIsImdldFBhZ2luYXRlZFBvc3RzIiwibXBpZHMiLCJjdXJyZW50UG9zdE51bSIsInRlYXJkb3duIiwiZW5kIiwicGFnaW5hdGVkVGVzdHJ1biIsIndhcm4iLCJhcmdzIiwidG9BcnJheSIsImFyZ3VtZW50cyIsInVuc2hpZnQiLCJhcHBseSIsInZhbCIsInBhdHRlcm4iLCJtYXRjaCIsInN0ciIsImxlbiIsImlzTnVtYmVyIiwid2hpY2hJc0ZhbHN5IiwiYXJyIiwiaSJdLCJtYXBwaW5ncyI6Ijs7OztBQUFBLElBQUlBLFFBQVFDLFFBQVEsT0FBUixDQUFaO0FBQ0EsSUFBSUMsUUFBUUQsUUFBUSxPQUFSLENBQVo7QUFDQSxJQUFJRSxJQUFJRixRQUFRLFdBQVIsQ0FBUjtBQUNBLElBQUlHLE9BQU8sU0FBUEEsSUFBTyxHQUFZLENBQUcsQ0FBMUI7QUFDQSxJQUFJQyxZQUFZLGlDQUFoQjtBQUNBLE1BQU1DLE9BQU9MLFFBQVEsTUFBUixDQUFiO0FBQ0EsTUFBTU0sVUFBVU4sUUFB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R0FBVixFQUFlQyxHQUFmLEVBQW9CO0FBQ3pDLE1BQUksT0FBT0QsR0FBUCxJQUFjLFFBQWxCLEVBQTRCLE9BQU9BLEdBQVA7QUFDNUJDLFFBQU05SSxFQUFFK0ksUUFBRixDQUFXRCxHQUFYLEtBQW1CQSxNQUFNLENBQXpCLEdBQTZCQSxHQUE3QixHQUFtQyxFQUF6QztBQUNBLFNBQU9ELElBQUlsQyxNQUFKLElBQWNtQyxHQUFkLEdBQW9CRCxHQUFwQixHQUEwQkEsSUFBSTNCLE1BQUosQ0FBVyxDQUFYLEVBQWM0QixNQUFNLENBQXBCLElBQXlCLEtBQTFEO0FBQ0QsQ0FKRDs7QUFNQXRJLFNBQVN3SSxZQUFULEdBQXdCLFVBQVVDLEdBQVYsRUFBZTtBQUNyQyxPQUFLLElBQUlDLElBQUksQ0FBYixFQUFnQkEsSUFBSUQsSUFBSXRDLE1BQXhCLEVBQWdDdUMsR0FBaEMsRUFBcUM7QUFDbkMsUUFBSSxDQUFDRCxJQUFJQyxDQUFKLENBQUwsRUFDRSxPQUFPQSxDQUFQO0FBQ0g7QUFDRCxTQUFPLElBQVA7QUFDRCxDQU5EIiwiZmlsZSI6ImluZGV4LmpzIiwic291cmNlc0NvbnRlbnQiOlsidmFyIGFzeW5jID0gcmVxdWlyZSgnYXN5bmMnKTtcbnZhciBteXNxbCA9IHJlcXVpcmUoJ215c3FsJyk7XG52YXIgXyA9IHJlcXVpcmUoJ2xvZGFzaC9mcCcpO1xudmFyIG5vb3AgPSBmdW5jdGlvbiAoKSB7IH07XG52YXIgbG9nUHJlZml4ID0gJ1tub2RlYmItcGx1Z2luLWltcG9ydC1waHBiYjMuMl0nO1xuY29uc3QgaHR0cCA9IHJlcXVpcmUoJ2h0dHAnKVxuY29uc3QgcHJvY2VzcyA9IHJlcXVpcmUoJ3Byb2Nlc3MnKVxuY29uc3QgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKVxuY29uc3QgZnMgPSByZXF1aXJlKCdmcycpXG5jb25zdCBta2RpcnAgPSByZXF1aXJlKCdta2RpcnAnKVxuXG5jb25zdCBFeHBvcnRlciA9IG1vZHVsZS5leHBvcnRzXG5cbmNvbnN0IGZpeEJCID0gKGJiKSA9PiB7XG4gIGNvbnN0IGZpeGVkID0gYmJcbiAgICAucmVwbGFjZSgvPHM+KFtcXHdcXFddKj8pPFxcL3M+L21pZywgJyQxJylcbiAgICAucmVwbGFjZSgvPGU+KFtcXHdcXFddKj8pPFxcL2U+L21pZywgJyQxJylcbiAgICAucmVwbGFjZSgvPFU+KFtcXHdcXFddKj8pPFxcL1U+L21pZywgJyQxJylcbiAgICAucmVwbGFjZSgvPEI+KFtcXHdcXFddKj8pPFxcL0I+L21pZywgJyQxJylcbiAgICAucmVwbGFjZSgvPHI+KFtcXHdcXFddKj8pPFxcL3I+L21pZywgJyQxJylcbiAgICAucmVwbGFjZSgvPHQ+KFtcXHdcXFddKj8pPFxcL3Q+L21pZywgJyQxJylcbiAgICAucmVwbGFjZSgvPHF1b3RlLio/PihbXFx3XFxXXSopPFxcL3F1b3RlPi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzxxdW90ZS4qPz4oW1xcd1xcV10qKTxcXC9xdW90ZT4vbWlnLCAnJDEnKVxuICAgIC5yZXBsYWNlKC88cXVvdGUuKj8+KFtcXHdcXFddKik8XFwvcXVvdGU+L21pZywgJyQxJylcbiAgICAucmVwbGFjZSgvPGNvbG9yLis/PihbXFx3XFxXXSo/KTxcXC9jb2xvcj4vbWlnLCAnJDEnKVxuICAgIC5yZXBsYWNlKC88bGlua190ZXh0Lis/PihbXFx3XFxXXSo/KTxcXC9saW5rX3RleHQ+L21pZywgJyQxJylcbiAgICAucmVwbGFjZSgvPHVybC4rPz4oW1xcd1xcV10qPyk8XFwvdXJsPi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzxlbW9qaS4rPz4oW1xcd1xcV10qPyk8XFwvZW1vamk+L21pZywgJyQxJylcbiAgICAucmVwbGFjZSgvPGF0dGFjaG1lbnQuKz8+KFtcXHdcXFddKj8pPFxcL2F0dGFjaG1lbnQ+L21pZywgJyQxJylcbiAgICAucmVwbGFjZSgvPCEtLVtePl0rLS0+LywgJycpIC8vIGh0bWwgY29tbWVudFxuICByZXR1cm4gZml4ZWRcbn1cblxuY29uc3QgZ2V0RmlsZSA9ICh1cmwsIG91dHB1dCkgPT4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICBjb25zdCBkZXN0ID0gcGF0aC5qb2luKHByb2Nlc3MuY3dkKCksICdwdWJsaWMnLCAndXBsb2FkcycsICdwaHBiYicsIG91dHB1dClcbiAgbWtkaXJwKHBhdGguZGlybmFtZShkZXN0KSwgZnVuY3Rpb24gKGVycikge1xuICAgIGlmIChlcnIpIHJldHVybiByZWplY3QoZXJyKVxuXG4gICAgRXhwb3J0ZXIubG9nKCdEb3dubG9hZGluZycsIHVybCwgJ3RvJywgZGVzdClcblxuICAgIHZhciBmaWxlID0gZnMuY3JlYXRlV3JpdGVTdHJlYW0oZGVzdCk7XG4gICAgdmFyIHJlcXVlc3QgPSBodHRwLmdldCh1cmwsIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgcmVzcG9uc2UucGlwZShmaWxlKTtcbiAgICAgIGZpbGUub24oJ2ZpbmlzaCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZmlsZS5jbG9zZShyZXNvbHZlKTtcbiAgICAgIH0pXG4gICAgfSkub24oJ2Vycm9yJywgZnVuY3Rpb24gKGVycikge1xuICAgICAgZnMudW5saW5rKGRlc3QpO1xuICAgICAgcmVqZWN0KGVyci5tZXNzYWdlKVxuICAgIH0pXG4gIH0pO1xufSlcblxuY29uc3QgZXhlY3V0ZVF1ZXJ5ID0gKHF1ZXJ5KSA9PiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gIEV4cG9ydGVyLmNvbm5lY3Rpb24ucXVlcnkocXVlcnksIChlcnIsIHJvd3MpID0+IHtcbiAgICBpZiAoZXJyKSByZXR1cm4gcmVqZWN0KGVycilcbiAgICByZXNvbHZlKHJvd3MpXG4gIH0pO1xufSlcblxuRXhwb3J0ZXIuc2V0dXAgPSAoY29uZmlnKSA9PiB7XG4gIEV4cG9ydGVyLmxvZygnc2V0dXAnKTtcblxuICB2YXIgX2NvbmZpZyA9IHtcbiAgICBob3N0OiBjb25maWcuZGJob3N0IHx8IGNvbmZpZy5ob3N0IHx8ICdsb2NhbGhvc3QnLFxuICAgIHVzZXI6IGNvbmZpZy5kYnVzZXIgfHwgY29uZmlnLnVzZXIgfHwgJ3Jvb3QnLFxuICAgIHBhc3N3b3JkOiBjb25maWcuZGJwYXNzIHx8IGNvbmZpZy5wYXNzIHx8IGNvbmZpZy5wYXNzd29yZCB8fCAnJyxcbiAgICBwb3J0OiBjb25maWcuZGJwb3J0IHx8IGNvbmZpZy5wb3J0IHx8IDMzMDYsXG4gICAgZGF0YWJhc2U6IGNvbmZpZy5kYm5hbWUgfHwgY29uZmlnLm5hbWUgfHwgY29uZmlnLmRhdGFiYXNlIHx8ICdwaHBiYicsXG4gICAgYXR0YWNobWVudF91cmw6IGNvbmZpZy5jdXN0b20gPyBjb25maWcuY3VzdG9tLmF0dGFjaG1lbnRfdXJsIDogZmFsc2UsXG4gIH07XG5cbiAgRXhwb3J0ZXIuY29uZmlnKF9jb25maWcpO1xuICBFeHBvcnRlci5jb25maWcoJ3ByZWZpeCcsIGNvbmZpZy5wcmVmaXggfHwgY29uZmlnLnRhYmxlUHJlZml4IHx8ICcnIC8qIHBocGJiXyA/ICovKTtcblxuICBFeHBvcnRlci5jb25uZWN0aW9uID0gbXlzcWwuY3JlYXRlQ29ubmVjdGlvbihfY29uZmlnKTtcbiAgRXhwb3J0ZXIuY29ubmVjdGlvbi5jb25uZWN0KCk7XG5cbiAgcmV0dXJuIEV4cG9ydGVyLmNvbmZpZygpXG59XG5cbkV4cG9ydGVyLmdldFBhZ2luYXRlZFVzZXJzID0gYXN5bmMgKHN0YXJ0LCBsaW1pdCkgPT4ge1xuICBFeHBvcnRlci5sb2coJ2dldFBhZ2luYXRlZFVzZXJzJylcbiAgdmFyIGVycjtcbiAgdmFyIHByZWZpeCA9IEV4cG9ydGVyLmNvbmZpZygncHJlZml4Jyk7XG4gIHZhciBzdGFydG1zID0gK25ldyBEYXRlKCk7XG4gIHZhciBxdWVyeSA9ICdTRUxFQ1QgJ1xuICAgICsgcHJlZml4ICsgJ3VzZXJzLnVzZXJfaWQgYXMgX3VpZCwgJ1xuICAgICsgcHJlZml4ICsgJ3VzZXJzLnVzZXJuYW1lIGFzIF91c2VybmFtZSwgJ1xuICAgICsgcHJlZml4ICsgJ3VzZXJzLnVzZXJuYW1lX2NsZWFuIGFzIF9hbHRlcm5hdGl2ZVVzZXJuYW1lLCAnXG4gICAgKyBwcmVmaXggKyAndXNlcnMudXNlcl9lbWFpbCBhcyBfcmVnaXN0cmF0aW9uRW1haWwsICdcbiAgICAvLysgcHJlZml4ICsgJ3VzZXJzLnVzZXJfcmFuayBhcyBfbGV2ZWwsICdcbiAgICArIHByZWZpeCArICd1c2Vycy51c2VyX3JlZ2RhdGUgYXMgX2pvaW5kYXRlLCAnXG4gICAgKyBwcmVmaXggKyAndXNlcnMudXNlcl9wb3N0cyBhcyBfcG9zdF9jb3VudCwgJ1xuICAgICsgcHJlZml4ICsgJ3VzZXJzLnVzZXJfZW1haWwgYXMgX2VtYWlsICdcbiAgICAvLysgcHJlZml4ICsgJ2Jhbmxpc3QuYmFuX2lkIGFzIF9iYW5uZWQgJ1xuICAgIC8vKyBwcmVmaXggKyAnVVNFUl9QUk9GSUxFLlVTRVJfU0lHTkFUVVJFIGFzIF9zaWduYXR1cmUsICdcbiAgICAvLysgcHJlZml4ICsgJ1VTRVJfUFJPRklMRS5VU0VSX0hPTUVQQUdFIGFzIF93ZWJzaXRlLCAnXG4gICAgLy8rIHByZWZpeCArICdVU0VSX1BST0ZJTEUuVVNFUl9PQ0NVUEFUSU9OIGFzIF9vY2N1cGF0aW9uLCAnXG4gICAgLy8rIHByZWZpeCArICdVU0VSX1BST0ZJTEUuVVNFUl9MT0NBVElPTiBhcyBfbG9jYXRpb24sICdcbiAgICAvLysgcHJlZml4ICsgJ1VTRVJfUFJPRklMRS5VU0VSX0FWQVRBUiBhcyBfcGljdHVyZSwgJ1xuICAgIC8vKyBwcmVmaXggKyAnVVNFUl9QUk9GSUxFLlVTRVJfVElUTEUgYXMgX3RpdGxlLCAnXG4gICAgLy8rIHByZWZpeCArICdVU0VSX1BST0ZJTEUuVVNFUl9SQVRJTkcgYXMgX3JlcHV0YXRpb24sICdcbiAgICAvLysgcHJlZml4ICsgJ1VTRVJfUFJPRklMRS5VU0VSX1RPVEFMX1JBVEVTIGFzIF9wcm9maWxldmlld3MsICdcbiAgICAvLysgcHJlZml4ICsgJ1VTRVJfUFJPRklMRS5VU0VSX0JJUlRIREFZIGFzIF9iaXJ0aGRheSAnXG5cbiAgICArICdGUk9NICcgKyBwcmVmaXggKyAndXNlcnMgJ1xuICAgICsgJ1dIRVJFICcgKyBwcmVmaXggKyAndXNlcnMudXNlcl9pZCA9ICcgKyBwcmVmaXggKyAndXNlcnMudXNlcl9pZCAnXG4gICAgKyAoc3RhcnQgPj0gMCAmJiBsaW1pdCA+PSAwID8gJ0xJTUlUICcgKyBzdGFydCArICcsJyArIGxpbWl0IDogJycpO1xuXG5cbiAgaWYgKCFFeHBvcnRlci5jb25uZWN0aW9uKSB7XG4gICAgZXJyID0geyBlcnJvcjogJ015U1FMIGNvbm5lY3Rpb24gaXMgbm90IHNldHVwLiBSdW4gc2V0dXAoY29uZmlnKSBmaXJzdCcgfTtcbiAgICBFeHBvcnRlci5lcnJvcihlcnIuZXJyb3IpO1xuICAgIHRocm93IGVyclxuICB9XG5cbiAgbGV0IHJvd3MgPSBhd2FpdCBleGVjdXRlUXVlcnkocXVlcnkpXG4gIHJvd3MgPSByb3dzLmZpbHRlcihyID0+IHIuX3Bvc3RfY291bnQgPiAwKVxuXG4gIC8vbm9ybWFsaXplIGhlcmVcbiAgdmFyIG1hcCA9IHt9O1xuICByb3dzLmZvckVhY2goZnVuY3Rpb24gKHJvdykge1xuICAgIC8vIG5iYiBmb3JjZXMgc2lnbmF0dXJlcyB0byBiZSBsZXNzIHRoYW4gMTUwIGNoYXJzXG4gICAgLy8ga2VlcGluZyBpdCBIVE1MIHNlZSBodHRwczovL2dpdGh1Yi5jb20vYWtob3VyeS9ub2RlYmItcGx1Z2luLWltcG9ydCNtYXJrZG93bi1ub3RlXG4gICAgcm93Ll9zaWduYXR1cmUgPSBFeHBvcnRlci50cnVuY2F0ZVN0cihyb3cuX3NpZ25hdHVyZSB8fCAnJywgMTUwKTtcblxuICAgIC8vIGZyb20gdW5peCB0aW1lc3RhbXAgKHMpIHRvIEpTIHRpbWVzdGFtcCAobXMpXG4gICAgcm93Ll9qb2luZGF0ZSA9ICgocm93Ll9qb2luZGF0ZSB8fCAwKSAqIDEwMDApIHx8IHN0YXJ0bXM7XG5cbiAgICAvLyBsb3dlciBjYXNlIHRoZSBlbWFpbCBmb3IgY29uc2lzdGVuY3lcbiAgICByb3cuX2VtYWlsID0gKHJvdy5fZW1haWwgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG5cbiAgICAvLyBJIGRvbid0IGtub3cgYWJvdXQgeW91IGFib3V0IEkgbm90aWNlZCBhIGxvdCBteSB1c2VycyBoYXZlIGluY29tcGxldGUgdXJscywgdXJscyBsaWtlOiBodHRwOi8vXG4gICAgcm93Ll9waWN0dXJlID0gRXhwb3J0ZXIudmFsaWRhdGVVcmwocm93Ll9waWN0dXJlKTtcbiAgICByb3cuX3dlYnNpdGUgPSBFeHBvcnRlci52YWxpZGF0ZVVybChyb3cuX3dlYnNpdGUpO1xuXG4gICAgbWFwW3Jvdy5fdWlkXSA9IHJvdztcbiAgfSk7XG5cbiAgcmV0dXJuIG1hcFxufTtcblxuRXhwb3J0ZXIuZ2V0UGFnaW5hdGVkQ2F0ZWdvcmllcyA9IGFzeW5jIChzdGFydCwgbGltaXQpID0+IHtcbiAgRXhwb3J0ZXIubG9nKCdnZXRQYWdpbmF0ZWRDYXRlZ29yaWVzJylcbiAgdmFyIGVycjtcbiAgdmFyIHByZWZpeCA9IEV4cG9ydGVyLmNvbmZpZygncHJlZml4Jyk7XG4gIHZhciBzdGFydG1zID0gK25ldyBEYXRlKCk7XG4gIHZhciBxdWVyeSA9ICdTRUxFQ1QgJ1xuICAgICsgcHJlZml4ICsgJ2ZvcnVtcy5mb3J1bV9pZCBhcyBfY2lkLCAnXG4gICAgKyBwcmVmaXggKyAnZm9ydW1zLmZvcnVtX25hbWUgYXMgX25hbWUsICdcbiAgICArIHByZWZpeCArICdmb3J1bXMuZm9ydW1fZGVzYyBhcyBfZGVzY3JpcHRpb24sICdcbiAgICArIHByZWZpeCArICdmb3J1bXMuZm9ydW1fcGFyZW50cyBhcyBfcGFyZW50Q2lkICdcbiAgICArICdGUk9NICcgKyBwcmVmaXggKyAnZm9ydW1zICdcbiAgICArIChzdGFydCA+PSAwICYmIGxpbWl0ID49IDAgPyAnTElNSVQgJyArIHN0YXJ0ICsgJywnICsgbGltaXQgOiAnJyk7XG5cbiAgaWYgKCFFeHBvcnRlci5jb25uZWN0aW9uKSB7XG4gICAgZXJyID0geyBlcnJvcjogJ015U1FMIGNvbm5lY3Rpb24gaXMgbm90IHNldHVwLiBSdW4gc2V0dXAoY29uZmlnKSBmaXJzdCcgfTtcbiAgICBFeHBvcnRlci5lcnJvcihlcnIuZXJyb3IpO1xuICAgIHRocm93IGVyclxuICB9XG5cbiAgY29uc3Qgcm93cyA9IGF3YWl0IGV4ZWN1dGVRdWVyeShxdWVyeSlcblxuICAvL25vcm1hbGl6ZSBoZXJlXG4gIHZhciBtYXAgPSB7fTtcbiAgZm9yIChjb25zdCByb3cgb2Ygcm93cykge1xuICAgIHJvdy5fbmFtZSA9IHJvdy5fbmFtZSB8fCAnVW50aXRsZWQgQ2F0ZWdvcnknO1xuICAgIHJvdy5fZGVzY3JpcHRpb24gPSByb3cuX2Rlc2NyaXB0aW9uIHx8ICcnO1xuICAgIHJvdy5fdGltZXN0YW1wID0gKChyb3cuX3RpbWVzdGFtcCB8fCAwKSAqIDEwMDApIHx8IHN0YXJ0bXM7XG4gICAgdHJ5IHtcbiAgICAgIHJvdy5fcGFyZW50Q2lkID0gTnVtYmVyKHJvdy5fcGFyZW50Q2lkLnNwbGl0KCc6JylbM10uc3BsaXQoJzsnKVswXSlcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByb3cuX3BhcmVudENpZCA9IHVuZGVmaW5lZFxuICAgIH1cblxuICAgIG1hcFtyb3cuX2NpZF0gPSByb3c7XG4gIH1cblxuICByZXR1cm4gbWFwXG59O1xuXG5jb25zdCBwcm9jZXNzQXR0YWNobWVudHMgPSBhc3luYyAoY29udGVudCwgcGlkKSA9PiB7XG4gIGNvbnN0IHByZWZpeCA9IEV4cG9ydGVyLmNvbmZpZygncHJlZml4Jyk7XG4gIGxldCBhdHRhY2htZW50cyA9IChhd2FpdCBleGVjdXRlUXVlcnkoYFxuXHRcdFNFTEVDVCAqIEZST00gJHtwcmVmaXh9YXR0YWNobWVudHMgV0hFUkUgcG9zdF9tc2dfaWQgPSAke3BpZH1cblx0YCkpLm1hcChhID0+ICh7XG4gICAgICBvcmlnX2ZpbGVuYW1lOiBhLnJlYWxfZmlsZW5hbWUsXG4gICAgICB1cmw6IFwiL3VwbG9hZHMvcGhwYmIvXCIgKyBhLnBoeXNpY2FsX2ZpbGVuYW1lLFxuICAgIH0pKVxuICBjb25zb2xlLmxvZygncHJvY2Vzc2luZycsIGF0dGFjaG1lbnRzKVxuICBjb25zdCB0ZW1wID0gW107XG4gIGZvciAoY29uc3QgYXR0IG9mIGF0dGFjaG1lbnRzKSB7XG4gICAgaWYgKGNvbnRlbnQuaW5kZXhPZihhdHQub3JpZ19maWxlbmFtZSkgPT09IC0xKSB7XG4gICAgICB0ZW1wLnB1c2goYCFbJHthdHQub3JpZ19maWxlbmFtZX1dKCR7YXR0LnVybH0pYCk7XG4gICAgfVxuICAgIGNvbnRlbnQgPSBjb250ZW50LnJlcGxhY2UoXG4gICAgICBuZXcgUmVnRXhwKGBcXFxcW2F0dGFjaG1lbnQuK1xcXFxdJHthdHQub3JpZ19maWxlbmFtZX1cXFxcWy9hdHRhY2htZW50XFxcXF1gLCAnZycpLCBgIVske2F0dC5vcmlnX2ZpbGVuYW1lfV0oJHthdHQudXJsfSlgXG4gICAgKVxuICB9XG4gIGlmICh0ZW1wLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gY29udGVudCArICdcXG4nICsgdGVtcC5qb2luKCdcXG4nKTtcbiAgfVxuICByZXR1cm4gY29udGVudFxufVxuXG5FeHBvcnRlci5nZXRQYWdpbmF0ZWRUb3BpY3MgPSBhc3luYyAoc3RhcnQsIGxpbWl0KSA9PiB7XG4gIEV4cG9ydGVyLmxvZygnZ2V0UGFnaW5hdGVkVG9waWNzJylcbiAgdmFyIGVycjtcbiAgdmFyIHByZWZpeCA9IEV4cG9ydGVyLmNvbmZpZygncHJlZml4Jyk7XG4gIHZhciBzdGFydG1zID0gK25ldyBEYXRlKCk7XG4gIHZhciBxdWVyeSA9XG4gICAgJ1NFTEVDVCAnXG4gICAgKyBwcmVmaXggKyAndG9waWNzLnRvcGljX2lkIGFzIF90aWQsICdcbiAgICArIHByZWZpeCArICd0b3BpY3MuZm9ydW1faWQgYXMgX2NpZCwgJ1xuXG4gICAgLy8gdGhpcyBpcyB0aGUgJ3BhcmVudC1wb3N0J1xuICAgIC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vYWtob3VyeS9ub2RlYmItcGx1Z2luLWltcG9ydCNpbXBvcnRhbnQtbm90ZS1vbi10b3BpY3MtYW5kLXBvc3RzXG4gICAgLy8gSSBkb24ndCByZWFsbHkgbmVlZCBpdCBzaW5jZSBJIGp1c3QgZG8gYSBzaW1wbGUgam9pbiBhbmQgZ2V0IGl0cyBjb250ZW50LCBidXQgSSB3aWxsIGluY2x1ZGUgZm9yIHRoZSByZWZlcmVuY2VcbiAgICAvLyByZW1lbWJlciB0aGlzIHBvc3QgRVhDTFVERUQgaW4gdGhlIGV4cG9ydFBvc3RzKCkgZnVuY3Rpb25cbiAgICArIHByZWZpeCArICd0b3BpY3MudG9waWNfZmlyc3RfcG9zdF9pZCBhcyBfcGlkLCAnXG5cbiAgICArIHByZWZpeCArICd0b3BpY3MudG9waWNfdmlld3MgYXMgX3ZpZXdjb3VudCwgJ1xuICAgICsgcHJlZml4ICsgJ3RvcGljcy50b3BpY190aXRsZSBhcyBfdGl0bGUsICdcbiAgICArIHByZWZpeCArICd0b3BpY3MudG9waWNfdGltZSBhcyBfdGltZXN0YW1wLCAnXG5cbiAgICAvLyBtYXliZSB1c2UgdGhhdCB0byBza2lwXG4gICAgLy8gKyBwcmVmaXggKyAndG9waWNzLnRvcGljX2FwcHJvdmVkIGFzIF9hcHByb3ZlZCwgJ1xuXG4gICAgKyBwcmVmaXggKyAndG9waWNzLnRvcGljX3N0YXR1cyBhcyBfc3RhdHVzLCAnXG5cbiAgICAvLysgcHJlZml4ICsgJ1RPUElDUy5UT1BJQ19JU19TVElDS1kgYXMgX3Bpbm5lZCwgJ1xuICAgICsgcHJlZml4ICsgJ3Bvc3RzLnBvc3Rlcl9pZCBhcyBfdWlkLCAnXG4gICAgLy8gdGhpcyBzaG91bGQgYmUgPT0gdG8gdGhlIF90aWQgb24gdG9wIG9mIHRoaXMgcXVlcnlcbiAgICArIHByZWZpeCArICdwb3N0cy50b3BpY19pZCBhcyBfcG9zdF90aWQsICdcblxuICAgIC8vIGFuZCB0aGVyZSBpcyB0aGUgY29udGVudCBJIG5lZWQgISFcbiAgICArIHByZWZpeCArICdwb3N0cy5wb3N0X3RleHQgYXMgX2NvbnRlbnQgJ1xuXG4gICAgKyAnRlJPTSAnICsgcHJlZml4ICsgJ3RvcGljcywgJyArIHByZWZpeCArICdwb3N0cyAnXG4gICAgLy8gc2VlXG4gICAgKyAnV0hFUkUgJyArIHByZWZpeCArICd0b3BpY3MudG9waWNfZmlyc3RfcG9zdF9pZD0nICsgcHJlZml4ICsgJ3Bvc3RzLnBvc3RfaWQgJ1xuICAgICsgKHN0YXJ0ID49IDAgJiYgbGltaXQgPj0gMCA/ICdMSU1JVCAnICsgc3RhcnQgKyAnLCcgKyBsaW1pdCA6ICcnKTtcblxuICBpZiAoIUV4cG9ydGVyLmNvbm5lY3Rpb24pIHtcbiAgICBlcnIgPSB7IGVycm9yOiAnTXlTUUwgY29ubmVjdGlvbiBpcyBub3Qgc2V0dXAuIFJ1biBzZXR1cChjb25maWcpIGZpcnN0JyB9O1xuICAgIEV4cG9ydGVyLmVycm9yKGVyci5lcnJvcik7XG4gICAgdGhyb3cgZXJyXG4gIH1cblxuICBjb25zdCByb3dzID0gYXdhaXQgZXhlY3V0ZVF1ZXJ5KHF1ZXJ5KVxuICBjb25zb2xlLmxvZygncm93cycsIHJvd3MpXG5cbiAgLy9ub3JtYWxpemUgaGVyZVxuICB2YXIgbWFwID0ge307XG4gIGxldCB0b3BpY0NvdW50ID0gMDtcbiAgZm9yIChjb25zdCByb3cgb2Ygcm93cykge1xuICAgIHRvcGljQ291bnQrK1xuICAgIEV4cG9ydGVyLmxvZyhgVG9waWMgJHt0b3BpY0NvdW50fSBvdXQgb2YgJHtyb3dzLmxlbmd0aH1gKVxuICAgIHJvdy5fY29udGVudCA9IGZpeEJCKHJvdy5fY29udGVudClcbiAgICByb3cuX2NvbnRlbnQgPSBhd2FpdCBwcm9jZXNzQXR0YWNobWVudHMocm93Ll9jb250ZW50LCByb3cuX3BpZClcbiAgICBjb25zb2xlLmxvZyhyb3cpXG5cbiAgICByb3cuX3RpdGxlID0gcm93Ll90aXRsZSA/IHJvdy5fdGl0bGVbMF0udG9VcHBlckNhc2UoKSArIHJvdy5fdGl0bGUuc3Vic3RyKDEpIDogJ1VudGl0bGVkJztcbiAgICByb3cuX3RpbWVzdGFtcCA9ICgocm93Ll90aW1lc3RhbXAgfHwgMCkgKiAxMDAwKSB8fCBzdGFydG1zO1xuXG4gICAgbWFwW3Jvdy5fdGlkXSA9IHJvdztcbiAgfVxuXG4gIHJldHVybiBtYXBcbn07XG5cbnZhciBnZXRUb3BpY3NNYWluUGlkcyA9IGFzeW5jICgpID0+IHtcbiAgaWYgKEV4cG9ydGVyLl90b3BpY3NNYWluUGlkcykge1xuICAgIHJldHVybiBFeHBvcnRlci5fdG9waWNzTWFpblBpZHNcbiAgfVxuICBjb25zdCB0b3BpY3NNYXAgPSBhd2FpdCBFeHBvcnRlci5nZXRQYWdpbmF0ZWRUb3BpY3MoMCwgLTEpXG5cbiAgRXhwb3J0ZXIuX3RvcGljc01haW5QaWRzID0ge307XG4gIE9iamVjdC5rZXlzKHRvcGljc01hcCkuZm9yRWFjaChmdW5jdGlvbiAoX3RpZCkge1xuICAgIHZhciB0b3BpYyA9IHRvcGljc01hcFtfdGlkXTtcbiAgICBFeHBvcnRlci5fdG9waWNzTWFpblBpZHNbdG9waWMuX3BpZF0gPSB0b3BpYy5fdGlkO1xuICB9KTtcbiAgcmV0dXJuIEV4cG9ydGVyLl90b3BpY3NNYWluUGlkc1xufTtcblxuKCgpID0+IHtcbiAgbGV0IGF0dGFjaG1lbnRzRG93bmxvYWRlZCA9IGZhbHNlXG4gIEV4cG9ydGVyLmRvd25sb2FkQXR0YWNobWVudHMgPSBhc3luYyAoKSA9PiB7XG4gICAgaWYgKCFFeHBvcnRlci5jb25maWcoKS5hdHRhY2htZW50X3VybCkgcmV0dXJuXG4gICAgaWYgKGF0dGFjaG1lbnRzRG93bmxvYWRlZCkgcmV0dXJuXG4gICAgYXR0YWNobWVudHNEb3dubG9hZGVkID0gdHJ1ZVxuICAgIEV4cG9ydGVyLmxvZygnRG93bmxvYWRpbmcgYXR0YWNobWVudHMnKVxuICAgIGNvbnN0IHByZWZpeCA9IEV4cG9ydGVyLmNvbmZpZygncHJlZml4Jyk7XG5cbiAgICBjb25zdCBhdHRhY2htZW50cyA9IGF3YWl0IGV4ZWN1dGVRdWVyeShgXG5cdFx0XHRTRUxFQ1QgKiBGUk9NICR7cHJlZml4fWF0dGFjaG1lbnRzXG5cdFx0YClcbiAgICBhd2FpdCBQcm9taXNlLmFsbChhdHRhY2htZW50cy5tYXAoYXN5bmMgKGEpID0+IGdldEZpbGUoXG4gICAgICBFeHBvcnRlci5jb25maWcoKS5hdHRhY2htZW50X3VybCArIGEucGh5c2ljYWxfZmlsZW5hbWUsXG4gICAgICBhLmF0dGFjaF9pZCArICdfJyArIGEucmVhbF9maWxlbmFtZVxuICAgICkpKVxuICB9XG59KSgpXG5cbkV4cG9ydGVyLmdldFBhZ2luYXRlZFBvc3RzID0gYXN5bmMgKHN0YXJ0LCBsaW1pdCkgPT4ge1xuICBFeHBvcnRlci5sb2coJ2dldFBhZ2luYXRlZFBvc3RzJylcbiAgYXdhaXQgRXhwb3J0ZXIuZG93bmxvYWRBdHRhY2htZW50cygpXG4gIHZhciBlcnI7XG4gIHZhciBwcmVmaXggPSBFeHBvcnRlci5jb25maWcoJ3ByZWZpeCcpO1xuICB2YXIgc3RhcnRtcyA9ICtuZXcgRGF0ZSgpO1xuICB2YXIgcXVlcnkgPVxuICAgICdTRUxFQ1QgJyArIHByZWZpeCArICdwb3N0cy5wb3N0X2lkIGFzIF9waWQsICdcbiAgICAvLysgJ1BPU1RfUEFSRU5UX0lEIGFzIF9wb3N0X3JlcGx5aW5nX3RvLCAnIHBocGJiIGRvZXNuJ3QgaGF2ZSBcInJlcGx5IHRvIGFub3RoZXIgcG9zdFwiXG4gICAgKyBwcmVmaXggKyAncG9zdHMudG9waWNfaWQgYXMgX3RpZCwgJ1xuICAgICsgcHJlZml4ICsgJ3Bvc3RzLnBvc3RfdGltZSBhcyBfdGltZXN0YW1wLCAnXG4gICAgLy8gbm90IGJlaW5nIHVzZWRcbiAgICArIHByZWZpeCArICdwb3N0cy5wb3N0X3N1YmplY3QgYXMgX3N1YmplY3QsICdcblxuICAgICsgcHJlZml4ICsgJ3Bvc3RzLnBvc3RfdGV4dCBhcyBfY29udGVudCwgJ1xuICAgICsgcHJlZml4ICsgJ3Bvc3RzLnBvc3Rlcl9pZCBhcyBfdWlkICdcblxuICAgIC8vIG1heWJlIHVzZSB0aGlzIG9uZSB0byBza2lwXG4gICAgLy8rIHByZWZpeCArICdwb3N0cy5wb3N0X2FwcHJvdmVkIGFzIF9hcHByb3ZlZCAnXG5cbiAgICArICdGUk9NICcgKyBwcmVmaXggKyAncG9zdHMgJ1xuXG4gICAgLy8gdGhlIG9uZXMgdGhhdCBhcmUgdG9waWNzIG1haW4gcG9zdHMgYXJlIGZpbHRlcmVkIGJlbG93XG4gICAgKyAnV0hFUkUgJyArIHByZWZpeCArICdwb3N0cy50b3BpY19pZCA+IDAgJ1xuICAgICsgKHN0YXJ0ID49IDAgJiYgbGltaXQgPj0gMCA/ICdMSU1JVCAnICsgc3RhcnQgKyAnLCcgKyBsaW1pdCA6ICcnKTtcblxuICBpZiAoIUV4cG9ydGVyLmNvbm5lY3Rpb24pIHtcbiAgICBlcnIgPSB7IGVycm9yOiAnTXlTUUwgY29ubmVjdGlvbiBpcyBub3Qgc2V0dXAuIFJ1biBzZXR1cChjb25maWcpIGZpcnN0JyB9O1xuICAgIEV4cG9ydGVyLmVycm9yKGVyci5lcnJvcik7XG4gICAgdGhyb3cgZXJyXG4gIH1cblxuICBjb25zdCByb3dzID0gYXdhaXQgZXhlY3V0ZVF1ZXJ5KHF1ZXJ5KVxuICBjb25zdCBtcGlkcyA9IGF3YWl0IGdldFRvcGljc01haW5QaWRzKClcblxuICAvL25vcm1hbGl6ZSBoZXJlXG4gIHZhciBtYXAgPSB7fTtcbiAgbGV0IGN1cnJlbnRQb3N0TnVtID0gMFxuICBmb3IgKGNvbnN0IHJvdyBvZiByb3dzKSB7XG4gICAgY3VycmVudFBvc3ROdW0rK1xuICAgIEV4cG9ydGVyLmxvZyhgUG9zdCAke2N1cnJlbnRQb3N0TnVtfSBvdXQgb2YgJHtyb3dzLmxlbmd0aH1gKVxuICAgIC8vIG1ha2UgaXQncyBub3QgYSB0b3BpY1xuICAgIGlmICghbXBpZHNbcm93Ll9waWRdKSB7XG4gICAgICByb3cuX2NvbnRlbnQgPSBmaXhCQihyb3cuX2NvbnRlbnQpXG4gICAgICByb3cuX2NvbnRlbnQgPSBhd2FpdCBwcm9jZXNzQXR0YWNobWVudHMocm93Ll9jb250ZW50LCByb3cuX3BpZClcbiAgICAgIHJvdy5fdGltZXN0YW1wID0gKChyb3cuX3RpbWVzdGFtcCB8fCAwKSAqIDEwMDApIHx8IHN0YXJ0bXM7XG4gICAgICBtYXBbcm93Ll9waWRdID0gcm93O1xuICAgIH1cbiAgfVxuICByZXR1cm4gbWFwXG59O1xuXG5FeHBvcnRlci50ZWFyZG93biA9ICgpID0+IHtcbiAgRXhwb3J0ZXIubG9nKCd0ZWFyZG93bicpO1xuICBFeHBvcnRlci5jb25uZWN0aW9uLmVuZCgpO1xuXG4gIEV4cG9ydGVyLmxvZygnRG9uZScpO1xufTtcblxuRXhwb3J0ZXIucGFnaW5hdGVkVGVzdHJ1biA9IGFzeW5jIChjb25maWcpID0+IHtcbiAgRXhwb3J0ZXIuc2V0dXAoY29uZmlnKVxuICBFeHBvcnRlci5nZXRQYWdpbmF0ZWRVc2VycygwLCAxMDAwKVxuICBFeHBvcnRlci5nZXRQYWdpbmF0ZWRDYXRlZ29yaWVzKDAsIDEwMDApXG4gIEV4cG9ydGVyLmdldFBhZ2luYXRlZFRvcGljcygwLCAxMDAwKVxuICBFeHBvcnRlci5nZXRQYWdpbmF0ZWRQb3N0cygxMDAxLCAyMDAwKVxuICBFeHBvcnRlci50ZWFyZG93bigpXG59O1xuXG5FeHBvcnRlci53YXJuID0gZnVuY3Rpb24gKCkge1xuICB2YXIgYXJncyA9IF8udG9BcnJheShhcmd1bWVudHMpO1xuICBhcmdzLnVuc2hpZnQobG9nUHJlZml4KTtcbiAgY29uc29sZS53YXJuLmFwcGx5KGNvbnNvbGUsIGFyZ3MpO1xufTtcblxuRXhwb3J0ZXIubG9nID0gZnVuY3Rpb24gKCkge1xuICB2YXIgYXJncyA9IF8udG9BcnJheShhcmd1bWVudHMpO1xuICBhcmdzLnVuc2hpZnQobG9nUHJlZml4KTtcbiAgY29uc29sZS5sb2cuYXBwbHkoY29uc29sZSwgYXJncyk7XG59O1xuXG5FeHBvcnRlci5lcnJvciA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGFyZ3MgPSBfLnRvQXJyYXkoYXJndW1lbnRzKTtcbiAgYXJncy51bnNoaWZ0KGxvZ1ByZWZpeCk7XG4gIGNvbnNvbGUuZXJyb3IuYXBwbHkoY29uc29sZSwgYXJncyk7XG59O1xuXG5FeHBvcnRlci5jb25maWcgPSBmdW5jdGlvbiAoY29uZmlnLCB2YWwpIHtcbiAgaWYgKGNvbmZpZyAhPSBudWxsKSB7XG4gICAgaWYgKHR5cGVvZiBjb25maWcgPT09ICdvYmplY3QnKSB7XG4gICAgICBFeHBvcnRlci5fY29uZmlnID0gY29uZmlnO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbmZpZyA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGlmICh2YWwgIT0gbnVsbCkge1xuICAgICAgICBFeHBvcnRlci5fY29uZmlnID0gRXhwb3J0ZXIuX2NvbmZpZyB8fCB7fTtcbiAgICAgICAgRXhwb3J0ZXIuX2NvbmZpZ1tjb25maWddID0gdmFsO1xuICAgICAgfVxuICAgICAgcmV0dXJuIEV4cG9ydGVyLl9jb25maWdbY29uZmlnXTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIEV4cG9ydGVyLl9jb25maWc7XG59O1xuXG4vLyBmcm9tIEFuZ3VsYXIgaHR0cHM6Ly9naXRodWIuY29tL2FuZ3VsYXIvYW5ndWxhci5qcy9ibG9iL21hc3Rlci9zcmMvbmcvZGlyZWN0aXZlL2lucHV0LmpzI0wxMVxuRXhwb3J0ZXIudmFsaWRhdGVVcmwgPSBmdW5jdGlvbiAodXJsKSB7XG4gIHZhciBwYXR0ZXJuID0gL14oZnRwfGh0dHB8aHR0cHMpOlxcL1xcLyhcXHcrOnswLDF9XFx3KkApPyhcXFMrKSg6WzAtOV0rKT8oXFwvfFxcLyhbXFx3IyE6Lj8rPSYlQCFcXC1cXC9dKSk/JC87XG4gIHJldHVybiB1cmwgJiYgdXJsLmxlbmd0aCA8IDIwODMgJiYgdXJsLm1hdGNoKHBhdHRlcm4pID8gdXJsIDogJyc7XG59O1xuXG5FeHBvcnRlci50cnVuY2F0ZVN0ciA9IGZ1bmN0aW9uIChzdHIsIGxlbikge1xuICBpZiAodHlwZW9mIHN0ciAhPSAnc3RyaW5nJykgcmV0dXJuIHN0cjtcbiAgbGVuID0gXy5pc051bWJlcihsZW4pICYmIGxlbiA+IDMgPyBsZW4gOiAyMDtcbiAgcmV0dXJuIHN0ci5sZW5ndGggPD0gbGVuID8gc3RyIDogc3RyLnN1YnN0cigwLCBsZW4gLSAzKSArICcuLi4nO1xufTtcblxuRXhwb3J0ZXIud2hpY2hJc0ZhbHN5ID0gZnVuY3Rpb24gKGFycikge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7IGkrKykge1xuICAgIGlmICghYXJyW2ldKVxuICAgICAgcmV0dXJuIGk7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59O1xuIl19