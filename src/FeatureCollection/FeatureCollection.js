import L from 'leaflet';

import { arcgisToGeoJSON } from 'arcgis-to-geojson-utils';
import { setRenderer } from './Renderer';

import { labelMarker } from '../Label/LabelMarker';
import { pointLabelPos } from '../Label/PointLabel';
import { polylineLabelPos } from '../Label/PolylineLabel';
import { polygonLabelPos } from '../Label/PolygonLabel';
import { createPopupContent } from '../Popup/Popup';

export var FeatureCollection = L.LayerGroup.extend({
  options: {
    data: {}, // Esri Feature Collection JSON or Item ID
    opacity: 1
  },

  initialize: function (layers, options) {
    L.setOptions(this, options);

    this.data = this.options.data;
    this.opacity = this.options.opacity;
    this.popupInfo = null;
    this.labelingInfo = null;
    this._layers = {};

    var i, len;

    if (layers) {
      for (i = 0, len = layers.length; i < len; i++) {
        this.addLayer(layers[i]);
      }
    }

    if (typeof this.data === 'string') {
      this._getFeatureCollection(this.data);
    } else {
      this._parseFeatureCollection(this.data);
    }
  },

  _getFeatureCollection: function (itemId) {
    var url = 'https://www.arcgis.com/sharing/rest/content/items/' + itemId + '/data';
    L.esri.request(url, {}, function (err, res) {
      if (err) {
        console.log(err);
      } else {
        this._parseFeatureCollection(res);
      }
    }, this);
  },

  _parseFeatureCollection: function (data) {
    var i, len;
    var self = this;
    var labelsLayer = L.featureGroup();

    for (i = 0, len = data.layers.length; i < len; i++) {
      if (!data.layers[i].featureSet.features.length) {
          continue;
      }

      var layer = data.layers[i];
      var layerDefinition = layer.layerDefinition || null;

      var features = layer.featureSet.features;
      var geometryType = layerDefinition.geometryType; // 'esriGeometryPoint' | 'esriGeometryMultipoint' | 'esriGeometryPolyline' | 'esriGeometryPolygon' | 'esriGeometryEnvelope'
      var objectIdField = layerDefinition.objectIdField;

      if (layerDefinition.extent.spatialReference.wkid !== 4326) {
          if (layerDefinition.extent.spatialReference.wkid !== 102100) {
              console.error('[L.esri.WebMap] this wkid (' + layerDefinition.extent.spatialReference.wkid + ') is not supported.');
          }
          features = this._projTo4326(features, geometryType);
      }
      // if (layer.popupInfo !== undefined) {
      //     this.popupInfo = layer.popupInfo;
      // }
      // if (layerDefinition.drawingInfo.labelingInfo !== undefined) {
      //     this.labelingInfo = layerDefinition.drawingInfo.labelingInfo;
      // }
      console.log(data);

      var geojson = this._featureCollectionToGeoJSON(features, objectIdField);

      var geojsonLayer = L.geoJSON([], {
        onEachFeature: function (geojson, l) {
          // if (fc !== undefined) {
          //   popupInfo = fc.popupInfo;
          //   labelingInfo = fc.labelingInfo;
          // }

          var popupInfo = layer.popupInfo;
          if (popupInfo !== undefined && popupInfo !== null) {
            var popupContent = createPopupContent(popupInfo, geojson.properties);
            l.bindPopup(popupContent);
          }

          var labelingInfo = layerDefinition.drawingInfo.labelingInfo;
          if (labelingInfo !== undefined && labelingInfo !== null) {
            var coordinates = l.feature.geometry.coordinates;
            var labelPos;

            if (l.feature.geometry.type === 'Point') {
              labelPos = pointLabelPos(coordinates);
            } else if (l.feature.geometry.type === 'LineString') {
              labelPos = polylineLabelPos(coordinates);
            } else if (l.feature.geometry.type === 'MultiLineString') {
              labelPos = polylineLabelPos(coordinates[Math.round(coordinates.length / 2)]);
            } else {
              labelPos = polygonLabelPos(l);
            }

            var label = labelMarker(labelPos.position, {
              zIndexOffset: 1,
              properties: geojson.properties,
              labelingInfo: labelingInfo,
              offset: labelPos.offset,
              pane: self.options.labelPaneName
            });

            labelsLayer.addLayer(label);
          }
        }
      });

      if (layerDefinition !== null) {
          setRenderer(layerDefinition, geojsonLayer);
      }

      geojsonLayer.addData(geojson);

      console.log(geojson);
      this.addLayer(geojsonLayer);
    }

    this.addLayer(labelsLayer);
  },

  _projTo4326: function (features, geometryType) {
    console.log('_project!');
    var i, len;
    var projFeatures = [];

    for (i = 0, len = features.length; i < len; i++) {
      var f = features[i];
      var mercatorToLatlng;
      var j, k;

      if (geometryType === 'esriGeometryPoint') {
        mercatorToLatlng = L.Projection.SphericalMercator.unproject(L.point(f.geometry.x, f.geometry.y));
        f.geometry.x = mercatorToLatlng.lng;
        f.geometry.y = mercatorToLatlng.lat;
      } else if (geometryType === 'esriGeometryMultipoint') {
        var plen;

        for (j = 0, plen = f.geometry.points.length; j < plen; j++) {
          mercatorToLatlng = L.Projection.SphericalMercator.unproject(L.point(f.geometry.points[j][0], f.geometry.points[j][1]));
          f.geometry.points[j][0] = mercatorToLatlng.lng;
          f.geometry.points[j][1] = mercatorToLatlng.lat;
        }
      } else if (geometryType === 'esriGeometryPolyline') {
        var pathlen, pathslen;

        for (j = 0, pathslen = f.geometry.paths.length; j < pathslen; j++) {
          for (k = 0, pathlen = f.geometry.paths[j].length; k < pathlen; k++) {
            mercatorToLatlng = L.Projection.SphericalMercator.unproject(L.point(f.geometry.paths[j][k][0], f.geometry.paths[j][k][1]));
            f.geometry.paths[j][k][0] = mercatorToLatlng.lng;
            f.geometry.paths[j][k][1] = mercatorToLatlng.lat;
          }
        }
      } else if (geometryType === 'esriGeometryPolygon') {
        var ringlen, ringslen;

        for (j = 0, ringslen = f.geometry.rings.length; j < ringslen; j++) {
          for (k = 0, ringlen = f.geometry.rings[j].length; k < ringlen; k++) {
            mercatorToLatlng = L.Projection.SphericalMercator.unproject(L.point(f.geometry.rings[j][k][0], f.geometry.rings[j][k][1]));
            f.geometry.rings[j][k][0] = mercatorToLatlng.lng;
            f.geometry.rings[j][k][1] = mercatorToLatlng.lat;
          }
        }
      }
      projFeatures.push(f);
    }

    return projFeatures;
  },

  _featureCollectionToGeoJSON: function (features, objectIdField) {
    var geojsonFeatureCollection = {
      type: 'FeatureCollection',
      features: []
    };
    var featuresArray = [];
    var i, len;

    for (i = 0, len = features.length; i < len; i++) {
      var geojson = arcgisToGeoJSON(features[i], objectIdField);
      featuresArray.push(geojson);
    }

    geojsonFeatureCollection.features = featuresArray;

    return geojsonFeatureCollection;
  }
});

export function featureCollection (geojson, options) {
  return new FeatureCollection(geojson, options);
}

export default featureCollection;
