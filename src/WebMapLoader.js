/*
 * L.esri.WebMap
 * A leaflet plugin to display ArcGIS Web Map. https://github.com/ynunokawa/L.esri.WebMap
 * (c) 2016 Yusuke Nunokawa
 *
 * @example
 *
 * ```js
 * var webmap = L.webmap('22c504d229f14c789c5b49ebff38b941', { map: L.map('map') });
 * ```
 */

import { version } from '../package.json';

import L from 'leaflet';
import { operationalLayer } from './OperationalLayer';

export var WebMap = L.Evented.extend({
  options: {
    // L.Map
    map: {},
    // access token for secure contents on ArcGIS Online
    token: null,
    // server domain name (default= 'www.arcgis.com')
    server: 'www.arcgis.com'
  },

  initialize: function (webmapId, options) {
    L.setOptions(this, options);

    this._map = this.options.map;
    this._token = this.options.token;
    this._server = this.options.server;
    this._webmapId = webmapId;
    this._loaded = false;
    this._metadataLoaded = false;
    this._loadedLayersNum = 0;
    this._layersNum = 0;

    this.layers = []; // Check the layer types here -> https://github.com/ynunokawa/L.esri.WebMap/wiki/Layer-types
    this.title = ''; // Web Map Title
    this.bookmarks = []; // Web Map Bookmarks -> [{ name: 'Bookmark name', bounds: <L.latLngBounds> }]
    this.portalItem = {}; // Web Map Metadata

    this.VERSION = version;

    this._loadWebMapMetaData(webmapId);
    this._loadWebMap(webmapId);
  },

  _checkLoaded: function () {
    this._loadedLayersNum++;
    if (this._loadedLayersNum === this._layersNum) {
      this._loaded = true;
      this.fire('load');
    }
  },

  _operationalLayer: function (layer, layers, map, params, paneName) {
    var lyr = operationalLayer(layer, layers, map, params);
    if (lyr !== undefined && layer.visibility === true) {
      lyr.addTo(map);
    }
  },

  _loadWebMapMetaData: function (id) {
    var params = {};
    var map = this._map;
    var webmap = this;
    var webmapMetaDataRequestUrl = 'https://' + this._server + '/sharing/rest/content/items/' + id;
    if (this._token && this._token.length > 0) {
      params.token = this._token;
    }

    this._request(webmapMetaDataRequestUrl, params, function (error, response) {
      if (error) {
        console.log(error);
      } else {
        console.log('WebMap MetaData: ', response);
        webmap.portalItem = response;
        webmap.title = response.title;
        webmap._metadataLoaded = true;
        webmap.fire('metadataLoad');
        map.fitBounds([response.extent[0].reverse(), response.extent[1].reverse()]);
      }
    });
  },

  _loadWebMap: function (id) {
    var map = this._map;
    var layers = this.layers;
    var server = this._server;
    var params = {};
    var webmapRequestUrl = 'https://' + server + '/sharing/rest/content/items/' + id + '/data';
    if (this._token && this._token.length > 0) {
      params.token = this._token;
    }

    this._request(webmapRequestUrl, params, function (error, response) {
      if (error) {
        console.log(error);
      } else {
        console.log('WebMap: ', response);
        this._layersNum = response.baseMap.baseMapLayers.length + response.operationalLayers.length;

        // Add Basemap
        response.baseMap.baseMapLayers.map(function (baseMapLayer) {
          if (baseMapLayer.itemId !== undefined) {
            var itemRequestUrl = 'https://' + server + '/sharing/rest/content/items/' + baseMapLayer.itemId;
            this._request(itemRequestUrl, params, function (err, res) {
              if (err) {
                console.error(error);
              } else {
                console.log(res.access);
                if (res.access !== 'public') {
                  this._operationalLayer(baseMapLayer, layers, map, params);
                } else {
                  this._operationalLayer(baseMapLayer, layers, map, {});
                }
              }
              this._checkLoaded();
            }, this);
          } else {
            this._operationalLayer(baseMapLayer, layers, map, {});
            this._checkLoaded();
          }
        }.bind(this));

        // Add Operational Layers
        response.operationalLayers.map(function (layer, i) {
          var paneName = 'esri-webmap-layer' + i;
          map.createPane(paneName);
          if (layer.itemId !== undefined) {
            var itemRequestUrl = 'https://' + server + '/sharing/rest/content/items/' + layer.itemId;
            this._request(itemRequestUrl, params, function (err, res) {
              if (err) {
                console.error(error);
              } else {
                console.log(res.access);
                if (res.access !== 'public') {
                  this._operationalLayer(layer, layers, map, params, paneName);
                } else {
                  this._operationalLayer(layer, layers, map, {}, paneName);
                }
              }
              this._checkLoaded();
            }, this);
          } else {
            this._operationalLayer(layer, layers, map, {}, paneName);
            this._checkLoaded();
          }
        }.bind(this));

        // Add Bookmarks
        if (response.bookmarks !== undefined && response.bookmarks.length > 0) {
          response.bookmarks.map(function (bookmark) {
            // Esri Extent Geometry to L.latLngBounds
            var northEast = L.Projection.SphericalMercator.unproject(L.point(bookmark.extent.xmax, bookmark.extent.ymax));
            var southWest = L.Projection.SphericalMercator.unproject(L.point(bookmark.extent.xmin, bookmark.extent.ymin));
            var bounds = L.latLngBounds(southWest, northEast);
            this.bookmarks.push({ name: bookmark.name, bounds: bounds });
          }.bind(this));
        }

        //this._loaded = true;
        //this.fire('load');
      }
    }.bind(this));
  },

  // request with auth handling
  _requestQueue: [],
  _authenticating:  false,

  authenticate: function(token) {
    this._authenticating = false;
    this._token = token;
    this._runQueue();
    return this;
  },

  _request: function(url, params, callback, context) {
    var wrappedCallback = this._createRequestCallback(url, params, callback, context);

    if (this._token) {
      params.token = this._token;
    }

    if (this._authenticating) {
      _requestQueue.push([url, params, callback, context]);
    }
    else {
      return L.esri.request(url, params, wrappedCallback, context);
    }
  },

  _createRequestCallback: function(url, params, callback, context) {
    return L.Util.bind(function(error, response) {
      if (error && (error.code === 403 || error.code === 499 || error.code === 498)) {
        this._authenticating = true;

        this._requestQueue.push([url, params, callback, context]);

        // fire an event for users to handle and re-authenticate
        this.fire('authenticationrequired', {
          authenticate: L.Util.bind(this.authenticate, this)
        }, true);

        // if the user has access to a callback they can handle the auth error
        error.authenticate = L.Util.bind(this.authenticate, this);
      }

      callback.call(context, error, response);
    }, this);
  },

  _runQueue: function() {
    for (var i = 0; i < this._requestQueue.length; i++) {
      var requestParams = this._requestQueue[i];
      this._request.apply(this, requestParams);
    }
    this._requestQueue = [];
  }
});

export function webMap (webmapId, options) {
  return new WebMap(webmapId, options);
}

export default webMap;
