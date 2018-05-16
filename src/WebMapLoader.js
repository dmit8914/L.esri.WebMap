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
    server: 'www.arcgis.com',
    // should we change the extent
    preserveExtent: false
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

    this._service = L.esri.service({
      token: this.options.token,
      url: 'https://' + this._server + '/sharing/rest/content/items/'
    });

    if (this.options.onAuthenticationRequired) {
      this._service.on('authenticationrequired', this.options.onAuthenticationRequired);
    }

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
      if(this._loadedWithErrors === true) {
        this.fire('load_failed');
      }
    }
  },

  _operationalLayer: function (layer, layers, map, params, paneName) {
    var lyr = operationalLayer(layer, layers, map, params, paneName);
    if (lyr !== undefined && layer.visibility === true) {

      if (this.options.onAuthenticationRequired) {
        lyr.on('authenticationrequired', this.options.onAuthenticationRequired);
      }
  
      lyr.addTo(map);
    }
    else {
      this._loadedWithErrors = true;
    }
  },

  _loadWebMapMetaData: function (id) {
    var map = this._map;
    var webmap = this;

    this._service.request(id, {}, function(error, response) {
      if (error) {
        console.log(error);
      } else {
        console.log('WebMap MetaData: ', response);
        webmap.portalItem = response;
        webmap.title = response.title;
        webmap._metadataLoaded = true;
        webmap.fire('metadataLoad');
        if(!this.options.preserveExtent) {
          map.fitBounds([response.extent[0].reverse(), response.extent[1].reverse()]);
        }
      }
    }, this);
  },

  _loadWebMap: function (id) {
    var map = this._map;
    var layers = this.layers;
    var server = this._server;
    var params = {};
    var webmapRequestUrl = id + '/data';
    if (this._token && this._token.length > 0) {
      params.token = this._token;
    }

    this._service.request(webmapRequestUrl, {}, function (error, response) {
      if (error) {
        console.log(error);
      } else {
        console.log('WebMap: ', response);
        this._layersNum = response.baseMap.baseMapLayers.length + response.operationalLayers.length;

        // Add Basemap
        response.baseMap.baseMapLayers.map(function (baseMapLayer) {
          if (baseMapLayer.itemId !== undefined) {
            this._service.request(baseMapLayer.itemId, {}, function (err, res) {
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
            this._service.request(layer.itemId, {}, function (err, res) {
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
  }
});

export function webMap (webmapId, options) {
  return new WebMap(webmapId, options);
}

export default webMap;
