/* esri-leaflet-webmap - v0.4.0 - Wed May 23 2018 18:29:39 GMT-0700 (PDT)
 * Copyright (c) 2018 Yusuke Nunokawa <ynunokawa.dev@gmail.com>
 * MIT */
(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('leaflet'), require('leaflet-omnivore')) :
	typeof define === 'function' && define.amd ? define(['exports', 'leaflet', 'leaflet-omnivore'], factory) :
	(factory((global.L = global.L || {}, global.L.esri = global.L.esri || {}),global.L,global.omnivore));
}(this, function (exports,L,omnivore) { 'use strict';

	L = 'default' in L ? L['default'] : L;
	omnivore = 'default' in omnivore ? omnivore['default'] : omnivore;

	var version = "0.4.0";

	/*
	 * Copyright 2015 Esri
	 *
	 * Licensed under the Apache License, Version 2.0 (the "License");
	 * you may not use this file except in compliance with the License.
	 * You may obtain a copy of the License at
	 *
	 *     http://www.apache.org/licenses/LICENSE-2.0
	 *
	 * Unless required by applicable law or agreed to in writing, software
	 * distributed under the License is distributed on an "AS IS" BASIS,
	 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	 * See the License for the specific language governing permissions and
	 * limitations under the Liscense.
	 */

	// checks if 2 x,y points are equal
	function pointsEqual (a, b) {
	  for (var i = 0; i < a.length; i++) {
	    if (a[i] !== b[i]) {
	      return false;
	    }
	  }
	  return true;
	}

	// checks if the first and last points of a ring are equal and closes the ring
	function closeRing (coordinates) {
	  if (!pointsEqual(coordinates[0], coordinates[coordinates.length - 1])) {
	    coordinates.push(coordinates[0]);
	  }
	  return coordinates;
	}

	// determine if polygon ring coordinates are clockwise. clockwise signifies outer ring, counter-clockwise an inner ring
	// or hole. this logic was found at http://stackoverflow.com/questions/1165647/how-to-determine-if-a-list-of-polygon-
	// points-are-in-clockwise-order
	function ringIsClockwise (ringToTest) {
	  var total = 0;
	  var i = 0;
	  var rLength = ringToTest.length;
	  var pt1 = ringToTest[i];
	  var pt2;
	  for (i; i < rLength - 1; i++) {
	    pt2 = ringToTest[i + 1];
	    total += (pt2[0] - pt1[0]) * (pt2[1] + pt1[1]);
	    pt1 = pt2;
	  }
	  return (total >= 0);
	}

	// ported from terraformer.js https://github.com/Esri/Terraformer/blob/master/terraformer.js#L504-L519
	function vertexIntersectsVertex (a1, a2, b1, b2) {
	  var uaT = (b2[0] - b1[0]) * (a1[1] - b1[1]) - (b2[1] - b1[1]) * (a1[0] - b1[0]);
	  var ubT = (a2[0] - a1[0]) * (a1[1] - b1[1]) - (a2[1] - a1[1]) * (a1[0] - b1[0]);
	  var uB = (b2[1] - b1[1]) * (a2[0] - a1[0]) - (b2[0] - b1[0]) * (a2[1] - a1[1]);

	  if (uB !== 0) {
	    var ua = uaT / uB;
	    var ub = ubT / uB;

	    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
	      return true;
	    }
	  }

	  return false;
	}

	// ported from terraformer.js https://github.com/Esri/Terraformer/blob/master/terraformer.js#L521-L531
	function arrayIntersectsArray (a, b) {
	  for (var i = 0; i < a.length - 1; i++) {
	    for (var j = 0; j < b.length - 1; j++) {
	      if (vertexIntersectsVertex(a[i], a[i + 1], b[j], b[j + 1])) {
	        return true;
	      }
	    }
	  }

	  return false;
	}

	// ported from terraformer.js https://github.com/Esri/Terraformer/blob/master/terraformer.js#L470-L480
	function coordinatesContainPoint (coordinates, point) {
	  var contains = false;
	  for (var i = -1, l = coordinates.length, j = l - 1; ++i < l; j = i) {
	    if (((coordinates[i][1] <= point[1] && point[1] < coordinates[j][1]) ||
	         (coordinates[j][1] <= point[1] && point[1] < coordinates[i][1])) &&
	        (point[0] < (coordinates[j][0] - coordinates[i][0]) * (point[1] - coordinates[i][1]) / (coordinates[j][1] - coordinates[i][1]) + coordinates[i][0])) {
	      contains = !contains;
	    }
	  }
	  return contains;
	}

	// ported from terraformer-arcgis-parser.js https://github.com/Esri/terraformer-arcgis-parser/blob/master/terraformer-arcgis-parser.js#L106-L113
	function coordinatesContainCoordinates (outer, inner) {
	  var intersects = arrayIntersectsArray(outer, inner);
	  var contains = coordinatesContainPoint(outer, inner[0]);
	  if (!intersects && contains) {
	    return true;
	  }
	  return false;
	}

	// do any polygons in this array contain any other polygons in this array?
	// used for checking for holes in arcgis rings
	// ported from terraformer-arcgis-parser.js https://github.com/Esri/terraformer-arcgis-parser/blob/master/terraformer-arcgis-parser.js#L117-L172
	function convertRingsToGeoJSON (rings) {
	  var outerRings = [];
	  var holes = [];
	  var x; // iterator
	  var outerRing; // current outer ring being evaluated
	  var hole; // current hole being evaluated

	  // for each ring
	  for (var r = 0; r < rings.length; r++) {
	    var ring = closeRing(rings[r].slice(0));
	    if (ring.length < 4) {
	      continue;
	    }
	    // is this ring an outer ring? is it clockwise?
	    if (ringIsClockwise(ring)) {
	      var polygon = [ ring ];
	      outerRings.push(polygon); // push to outer rings
	    } else {
	      holes.push(ring); // counterclockwise push to holes
	    }
	  }

	  var uncontainedHoles = [];

	  // while there are holes left...
	  while (holes.length) {
	    // pop a hole off out stack
	    hole = holes.pop();

	    // loop over all outer rings and see if they contain our hole.
	    var contained = false;
	    for (x = outerRings.length - 1; x >= 0; x--) {
	      outerRing = outerRings[x][0];
	      if (coordinatesContainCoordinates(outerRing, hole)) {
	        // the hole is contained push it into our polygon
	        outerRings[x].push(hole);
	        contained = true;
	        break;
	      }
	    }

	    // ring is not contained in any outer ring
	    // sometimes this happens https://github.com/Esri/esri-leaflet/issues/320
	    if (!contained) {
	      uncontainedHoles.push(hole);
	    }
	  }

	  // if we couldn't match any holes using contains we can try intersects...
	  while (uncontainedHoles.length) {
	    // pop a hole off out stack
	    hole = uncontainedHoles.pop();

	    // loop over all outer rings and see if any intersect our hole.
	    var intersects = false;

	    for (x = outerRings.length - 1; x >= 0; x--) {
	      outerRing = outerRings[x][0];
	      if (arrayIntersectsArray(outerRing, hole)) {
	        // the hole is contained push it into our polygon
	        outerRings[x].push(hole);
	        intersects = true;
	        break;
	      }
	    }

	    if (!intersects) {
	      outerRings.push([hole.reverse()]);
	    }
	  }

	  if (outerRings.length === 1) {
	    return {
	      type: 'Polygon',
	      coordinates: outerRings[0]
	    };
	  } else {
	    return {
	      type: 'MultiPolygon',
	      coordinates: outerRings
	    };
	  }
	}

	// shallow object clone for feature properties and attributes
	// from http://jsperf.com/cloning-an-object/2
	function shallowClone (obj) {
	  var target = {};
	  for (var i in obj) {
	    if (obj.hasOwnProperty(i)) {
	      target[i] = obj[i];
	    }
	  }
	  return target;
	}

	function arcgisToGeoJSON (arcgis, idAttribute) {
	  var geojson = {};

	  if (typeof arcgis.x === 'number' && typeof arcgis.y === 'number') {
	    geojson.type = 'Point';
	    geojson.coordinates = [arcgis.x, arcgis.y];
	  }

	  if (arcgis.points) {
	    geojson.type = 'MultiPoint';
	    geojson.coordinates = arcgis.points.slice(0);
	  }

	  if (arcgis.paths) {
	    if (arcgis.paths.length === 1) {
	      geojson.type = 'LineString';
	      geojson.coordinates = arcgis.paths[0].slice(0);
	    } else {
	      geojson.type = 'MultiLineString';
	      geojson.coordinates = arcgis.paths.slice(0);
	    }
	  }

	  if (arcgis.rings) {
	    geojson = convertRingsToGeoJSON(arcgis.rings.slice(0));
	  }

	  if (arcgis.geometry || arcgis.attributes) {
	    geojson.type = 'Feature';
	    geojson.geometry = (arcgis.geometry) ? arcgisToGeoJSON(arcgis.geometry) : null;
	    geojson.properties = (arcgis.attributes) ? shallowClone(arcgis.attributes) : null;
	    if (arcgis.attributes) {
	      geojson.id = arcgis.attributes[idAttribute] || arcgis.attributes.OBJECTID || arcgis.attributes.FID;
	    }
	  }

	  return geojson;
	}

	var Symbol = L.Class.extend({
	  initialize: function (symbolJson, options) {
	    this._symbolJson = symbolJson;
	    this.val = null;
	    this._styles = {};
	    this._isDefault = false;
	    this._layerTransparency = 1;
	    if (options && options.layerTransparency) {
	      this._layerTransparency = 1 - (options.layerTransparency / 100.0);
	    }
	  },

	  // the geojson values returned are in points
	  pixelValue: function (pointValue) {
	    return pointValue * 1.333;
	  },

	  // color is an array [r,g,b,a]
	  colorValue: function (color) {
	    return 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
	  },

	  alphaValue: function (color) {
	    var alpha = color[3] / 255.0;
	    return alpha * this._layerTransparency;
	  },

	  getSize: function (feature, sizeInfo) {
	    var attr = feature.properties;
	    var field = sizeInfo.field;
	    var size = 0;
	    var featureValue = null;

	    if (field) {
	      featureValue = attr[field];
	      var minSize = sizeInfo.minSize;
	      var maxSize = sizeInfo.maxSize;
	      var minDataValue = sizeInfo.minDataValue;
	      var maxDataValue = sizeInfo.maxDataValue;
	      var featureRatio;
	      var normField = sizeInfo.normalizationField;
	      var normValue = attr ? parseFloat(attr[normField]) : undefined;

	      if (featureValue === null || (normField && ((isNaN(normValue) || normValue === 0)))) {
	        return null;
	      }

	      if (!isNaN(normValue)) {
	        featureValue /= normValue;
	      }

	      if (minSize !== null && maxSize !== null && minDataValue !== null && maxDataValue !== null) {
	        if (featureValue <= minDataValue) {
	          size = minSize;
	        } else if (featureValue >= maxDataValue) {
	          size = maxSize;
	        } else {
	          featureRatio = (featureValue - minDataValue) / (maxDataValue - minDataValue);
	          size = minSize + (featureRatio * (maxSize - minSize));
	        }
	      }
	      size = isNaN(size) ? 0 : size;
	    }
	    return size;
	  },

	  getColor: function (feature, colorInfo) {
	    // required information to get color
	    if (!(feature.properties && colorInfo && colorInfo.field && colorInfo.stops)) {
	      return null;
	    }

	    var attr = feature.properties;
	    var featureValue = attr[colorInfo.field];
	    var lowerBoundColor, upperBoundColor, lowerBound, upperBound;
	    var normField = colorInfo.normalizationField;
	    var normValue = attr ? parseFloat(attr[normField]) : undefined;
	    if (featureValue === null || (normField && ((isNaN(normValue) || normValue === 0)))) {
	      return null;
	    }

	    if (!isNaN(normValue)) {
	      featureValue /= normValue;
	    }

	    if (featureValue <= colorInfo.stops[0].value) {
	      return colorInfo.stops[0].color;
	    }
	    var lastStop = colorInfo.stops[colorInfo.stops.length - 1];
	    if (featureValue >= lastStop.value) {
	      return lastStop.color;
	    }

	    // go through the stops to find min and max
	    for (var i = 0; i < colorInfo.stops.length; i++) {
	      var stopInfo = colorInfo.stops[i];

	      if (stopInfo.value <= featureValue) {
	        lowerBoundColor = stopInfo.color;
	        lowerBound = stopInfo.value;
	      } else if (stopInfo.value > featureValue) {
	        upperBoundColor = stopInfo.color;
	        upperBound = stopInfo.value;
	        break;
	      }
	    }

	    // feature falls between two stops, interplate the colors
	    if (!isNaN(lowerBound) && !isNaN(upperBound)) {
	      var range = upperBound - lowerBound;
	      if (range > 0) {
	        // more weight the further it is from the lower bound
	        var upperBoundColorWeight = (featureValue - lowerBound) / range;
	        if (upperBoundColorWeight) {
	          // more weight the further it is from the upper bound
	          var lowerBoundColorWeight = (upperBound - featureValue) / range;
	          if (lowerBoundColorWeight) {
	            // interpolate the lower and upper bound color by applying the
	            // weights to each of the rgba colors and adding them together
	            var interpolatedColor = [];
	            for (var j = 0; j < 4; j++) {
	              interpolatedColor[j] = Math.round(lowerBoundColor[j] * lowerBoundColorWeight + upperBoundColor[j] * upperBoundColorWeight);
	            }
	            return interpolatedColor;
	          } else {
	            // no difference between featureValue and upperBound, 100% of upperBoundColor
	            return upperBoundColor;
	          }
	        } else {
	          // no difference between featureValue and lowerBound, 100% of lowerBoundColor
	          return lowerBoundColor;
	        }
	      }
	    }
	    // if we get to here, none of the cases apply so return null
	    return null;
	  }
	});

	var ShapeMarker = L.Path.extend({

	  initialize: function (latlng, size, options) {
	    L.setOptions(this, options);
	    this._size = size;
	    this._latlng = L.latLng(latlng);
	    this._svgCanvasIncludes();
	  },

	  toGeoJSON: function () {
	    return L.GeoJSON.getFeature(this, {
	      type: 'Point',
	      coordinates: L.GeoJSON.latLngToCoords(this.getLatLng())
	    });
	  },

	  _svgCanvasIncludes: function () {
	    // implement in sub class
	  },

	  _project: function () {
	    this._point = this._map.latLngToLayerPoint(this._latlng);
	  },

	  _update: function () {
	    if (this._map) {
	      this._updatePath();
	    }
	  },

	  _updatePath: function () {
	    // implement in sub class
	  },

	  setLatLng: function (latlng) {
	    this._latlng = L.latLng(latlng);
	    this.redraw();
	    return this.fire('move', {latlng: this._latlng});
	  },

	  getLatLng: function () {
	    return this._latlng;
	  },

	  setSize: function (size) {
	    this._size = size;
	    return this.redraw();
	  },

	  getSize: function () {
	    return this._size;
	  }
	});

	var CrossMarker = ShapeMarker.extend({

	  initialize: function (latlng, size, options) {
	    ShapeMarker.prototype.initialize.call(this, latlng, size, options);
	  },

	  _updatePath: function () {
	    this._renderer._updateCrossMarker(this);
	  },

	  _svgCanvasIncludes: function () {
	    L.Canvas.include({
	      _updateCrossMarker: function (layer) {
	        var latlng = layer._point;
	        var offset = layer._size / 2.0;
	        var ctx = this._ctx;

	        ctx.beginPath();
	        ctx.moveTo(latlng.x, latlng.y + offset);
	        ctx.lineTo(latlng.x, latlng.y - offset);
	        this._fillStroke(ctx, layer);

	        ctx.moveTo(latlng.x - offset, latlng.y);
	        ctx.lineTo(latlng.x + offset, latlng.y);
	        this._fillStroke(ctx, layer);
	      }
	    });

	    L.SVG.include({
	      _updateCrossMarker: function (layer) {
	        var latlng = layer._point;
	        var offset = layer._size / 2.0;

	        if (L.Browser.vml) {
	          latlng._round();
	          offset = Math.round(offset);
	        }

	        var str = 'M' + latlng.x + ',' + (latlng.y + offset) +
	          'L' + latlng.x + ',' + (latlng.y - offset) +
	          'M' + (latlng.x - offset) + ',' + latlng.y +
	          'L' + (latlng.x + offset) + ',' + latlng.y;

	        this._setPath(layer, str);
	      }
	    });
	  }
	});

	var crossMarker = function (latlng, size, options) {
	  return new CrossMarker(latlng, size, options);
	};

	var XMarker = ShapeMarker.extend({

	  initialize: function (latlng, size, options) {
	    ShapeMarker.prototype.initialize.call(this, latlng, size, options);
	  },

	  _updatePath: function () {
	    this._renderer._updateXMarker(this);
	  },

	  _svgCanvasIncludes: function () {
	    L.Canvas.include({
	      _updateXMarker: function (layer) {
	        var latlng = layer._point;
	        var offset = layer._size / 2.0;
	        var ctx = this._ctx;

	        ctx.beginPath();

	        ctx.moveTo(latlng.x + offset, latlng.y + offset);
	        ctx.lineTo(latlng.x - offset, latlng.y - offset);
	        this._fillStroke(ctx, layer);
	      }
	    });

	    L.SVG.include({
	      _updateXMarker: function (layer) {
	        var latlng = layer._point;
	        var offset = layer._size / 2.0;

	        if (L.Browser.vml) {
	          latlng._round();
	          offset = Math.round(offset);
	        }

	        var str = 'M' + (latlng.x + offset) + ',' + (latlng.y + offset) +
	          'L' + (latlng.x - offset) + ',' + (latlng.y - offset) +
	          'M' + (latlng.x - offset) + ',' + (latlng.y + offset) +
	          'L' + (latlng.x + offset) + ',' + (latlng.y - offset);

	        this._setPath(layer, str);
	      }
	    });
	  }
	});

	var xMarker = function (latlng, size, options) {
	  return new XMarker(latlng, size, options);
	};

	var SquareMarker = ShapeMarker.extend({
	  options: {
	    fill: true
	  },

	  initialize: function (latlng, size, options) {
	    ShapeMarker.prototype.initialize.call(this, latlng, size, options);
	  },

	  _updatePath: function () {
	    this._renderer._updateSquareMarker(this);
	  },

	  _svgCanvasIncludes: function () {
	    L.Canvas.include({
	      _updateSquareMarker: function (layer) {
	        var latlng = layer._point;
	        var offset = layer._size / 2.0;
	        var ctx = this._ctx;

	        ctx.beginPath();

	        ctx.moveTo(latlng.x + offset, latlng.y + offset);
	        ctx.lineTo(latlng.x - offset, latlng.y + offset);
	        ctx.lineTo(latlng.x - offset, latlng.y - offset);
	        ctx.lineTo(latlng.x + offset, latlng.y - offset);

	        ctx.closePath();

	        this._fillStroke(ctx, layer);
	      }
	    });

	    L.SVG.include({
	      _updateSquareMarker: function (layer) {
	        var latlng = layer._point;
	        var offset = layer._size / 2.0;

	        if (L.Browser.vml) {
	          latlng._round();
	          offset = Math.round(offset);
	        }

	        var str = 'M' + (latlng.x + offset) + ',' + (latlng.y + offset) +
	          'L' + (latlng.x - offset) + ',' + (latlng.y + offset) +
	          'L' + (latlng.x - offset) + ',' + (latlng.y - offset) +
	          'L' + (latlng.x + offset) + ',' + (latlng.y - offset);

	        str = str + (L.Browser.svg ? 'z' : 'x');

	        this._setPath(layer, str);
	      }
	    });
	  }
	});

	var squareMarker = function (latlng, size, options) {
	  return new SquareMarker(latlng, size, options);
	};

	var DiamondMarker = ShapeMarker.extend({
	  options: {
	    fill: true
	  },

	  initialize: function (latlng, size, options) {
	    ShapeMarker.prototype.initialize.call(this, latlng, size, options);
	  },

	  _updatePath: function () {
	    this._renderer._updateDiamondMarker(this);
	  },

	  _svgCanvasIncludes: function () {
	    L.Canvas.include({
	      _updateDiamondMarker: function (layer) {
	        var latlng = layer._point;
	        var offset = layer._size / 2.0;
	        var ctx = this._ctx;

	        ctx.beginPath();

	        ctx.moveTo(latlng.x, latlng.y + offset);
	        ctx.lineTo(latlng.x - offset, latlng.y);
	        ctx.lineTo(latlng.x, latlng.y - offset);
	        ctx.lineTo(latlng.x + offset, latlng.y);

	        ctx.closePath();

	        this._fillStroke(ctx, layer);
	      }
	    });

	    L.SVG.include({
	      _updateDiamondMarker: function (layer) {
	        var latlng = layer._point;
	        var offset = layer._size / 2.0;

	        if (L.Browser.vml) {
	          latlng._round();
	          offset = Math.round(offset);
	        }

	        var str = 'M' + latlng.x + ',' + (latlng.y + offset) +
	          'L' + (latlng.x - offset) + ',' + latlng.y +
	          'L' + latlng.x + ',' + (latlng.y - offset) +
	          'L' + (latlng.x + offset) + ',' + latlng.y;

	        str = str + (L.Browser.svg ? 'z' : 'x');

	        this._setPath(layer, str);
	      }
	    });
	  }
	});

	var diamondMarker = function (latlng, size, options) {
	  return new DiamondMarker(latlng, size, options);
	};

	var PointSymbol = Symbol.extend({

	  statics: {
	    MARKERTYPES: ['esriSMSCircle', 'esriSMSCross', 'esriSMSDiamond', 'esriSMSSquare', 'esriSMSX', 'esriPMS']
	  },

	  initialize: function (symbolJson, options) {
	    var url;
	    Symbol.prototype.initialize.call(this, symbolJson, options);
	    if (options) {
	      this.serviceUrl = options.url;
	    }
	    if (symbolJson) {
	      if (symbolJson.type === 'esriPMS') {
	        var imageUrl = this._symbolJson.url;
	        if (imageUrl && imageUrl.substr(0, 7) === 'http://' || imageUrl.substr(0, 8) === 'https://') {
	          // web image
	          url = this.sanitize(imageUrl);
	          this._iconUrl = url;
	        } else {
	          url = this.serviceUrl + 'images/' + imageUrl;
	          this._iconUrl = options && options.token ? url + '?token=' + options.token : url;
	        }
	        if (symbolJson.imageData) {
	          this._iconUrl = 'data:' + symbolJson.contentType + ';base64,' + symbolJson.imageData;
	        }
	        // leaflet does not allow resizing icons so keep a hash of different
	        // icon sizes to try and keep down on the number of icons created
	        this._icons = {};
	        // create base icon
	        this.icon = this._createIcon(this._symbolJson);
	      } else {
	        this._fillStyles();
	      }
	    }
	  },

	  // prevent html injection in strings
	  sanitize: function (str) {
	    if (!str) {
	      return '';
	    }
	    var text;
	    try {
	      // removes html but leaves url link text
	      text = str.replace(/<br>/gi, '\n');
	      text = text.replace(/<p.*>/gi, '\n');
	      text = text.replace(/<a.*href='(.*?)'.*>(.*?)<\/a>/gi, ' $2 ($1) ');
	      text = text.replace(/<(?:.|\s)*?>/g, '');
	    } catch (ex) {
	      text = null;
	    }
	    return text;
	  },

	  _fillStyles: function () {
	    if (this._symbolJson.outline && this._symbolJson.size > 0 && this._symbolJson.outline.style !== 'esriSLSNull') {
	      this._styles.stroke = true;
	      this._styles.weight = this.pixelValue(this._symbolJson.outline.width);
	      this._styles.color = this.colorValue(this._symbolJson.outline.color);
	      this._styles.opacity = this.alphaValue(this._symbolJson.outline.color);
	    } else {
	      this._styles.stroke = false;
	    }
	    if (this._symbolJson.color) {
	      this._styles.fillColor = this.colorValue(this._symbolJson.color);
	      this._styles.fillOpacity = this.alphaValue(this._symbolJson.color);
	    } else {
	      this._styles.fillOpacity = 0;
	    }

	    if (this._symbolJson.style === 'esriSMSCircle') {
	      this._styles.radius = this.pixelValue(this._symbolJson.size) / 2.0;
	    }
	  },

	  _createIcon: function (options) {
	    var width = this.pixelValue(options.width);
	    var height = width;
	    if (options.height) {
	      height = this.pixelValue(options.height);
	    }
	    var xOffset = width / 2.0;
	    var yOffset = height / 2.0;

	    if (options.xoffset) {
	      xOffset += this.pixelValue(options.xoffset);
	    }
	    if (options.yoffset) {
	      yOffset += this.pixelValue(options.yoffset);
	    }

	    var icon = L.icon({
	      iconUrl: this._iconUrl,
	      iconSize: [width, height],
	      iconAnchor: [xOffset, yOffset]
	    });
	    this._icons[options.width.toString()] = icon;
	    return icon;
	  },

	  _getIcon: function (size) {
	    // check to see if it is already created by size
	    var icon = this._icons[size.toString()];
	    if (!icon) {
	      icon = this._createIcon({width: size});
	    }
	    return icon;
	  },

	  pointToLayer: function (geojson, latlng, visualVariables, options) {
	    var size = this._symbolJson.size || this._symbolJson.width;
	    if (!this._isDefault) {
	      if (visualVariables.sizeInfo) {
	        var calculatedSize = this.getSize(geojson, visualVariables.sizeInfo);
	        if (calculatedSize) {
	          size = calculatedSize;
	        }
	      }
	      if (visualVariables.colorInfo) {
	        var color = this.getColor(geojson, visualVariables.colorInfo);
	        if (color) {
	          this._styles.fillColor = this.colorValue(color);
	          this._styles.fillOpacity = this.alphaValue(color);
	        }
	      }
	    }

	    if (this._symbolJson.type === 'esriPMS') {
	      var layerOptions = L.extend({}, {icon: this._getIcon(size)}, options);
	      return L.marker(latlng, layerOptions);
	    }
	    size = this.pixelValue(size);

	    switch (this._symbolJson.style) {
	      case 'esriSMSSquare':
	        return squareMarker(latlng, size, L.extend({}, this._styles, options));
	      case 'esriSMSDiamond':
	        return diamondMarker(latlng, size, L.extend({}, this._styles, options));
	      case 'esriSMSCross':
	        return crossMarker(latlng, size, L.extend({}, this._styles, options));
	      case 'esriSMSX':
	        return xMarker(latlng, size, L.extend({}, this._styles, options));
	    }
	    this._styles.radius = size / 2.0;
	    return L.circleMarker(latlng, L.extend({}, this._styles, options));
	  }
	});

	function pointSymbol (symbolJson, options) {
	  return new PointSymbol(symbolJson, options);
	}

	var LineSymbol = Symbol.extend({
	  statics: {
	    // Not implemented 'esriSLSNull'
	    LINETYPES: ['esriSLSDash', 'esriSLSDot', 'esriSLSDashDotDot', 'esriSLSDashDot', 'esriSLSSolid']
	  },
	  initialize: function (symbolJson, options) {
	    Symbol.prototype.initialize.call(this, symbolJson, options);
	    this._fillStyles();
	  },

	  _fillStyles: function () {
	    // set the defaults that show up on arcgis online
	    this._styles.lineCap = 'butt';
	    this._styles.lineJoin = 'miter';
	    this._styles.fill = false;
	    this._styles.weight = 0;

	    if (!this._symbolJson) {
	      return this._styles;
	    }

	    if (this._symbolJson.color) {
	      this._styles.color = this.colorValue(this._symbolJson.color);
	      this._styles.opacity = this.alphaValue(this._symbolJson.color);
	    }

	    if (!isNaN(this._symbolJson.width)) {
	      this._styles.weight = this.pixelValue(this._symbolJson.width);

	      var dashValues = [];

	      switch (this._symbolJson.style) {
	        case 'esriSLSDash':
	          dashValues = [4, 3];
	          break;
	        case 'esriSLSDot':
	          dashValues = [1, 3];
	          break;
	        case 'esriSLSDashDot':
	          dashValues = [8, 3, 1, 3];
	          break;
	        case 'esriSLSDashDotDot':
	          dashValues = [8, 3, 1, 3, 1, 3];
	          break;
	      }

	      // use the dash values and the line weight to set dash array
	      if (dashValues.length > 0) {
	        for (var i = 0; i < dashValues.length; i++) {
	          dashValues[i] *= this._styles.weight;
	        }

	        this._styles.dashArray = dashValues.join(',');
	      }
	    }
	  },

	  style: function (feature, visualVariables) {
	    if (!this._isDefault && visualVariables) {
	      if (visualVariables.sizeInfo) {
	        var calculatedSize = this.pixelValue(this.getSize(feature, visualVariables.sizeInfo));
	        if (calculatedSize) {
	          this._styles.weight = calculatedSize;
	        }
	      }
	      if (visualVariables.colorInfo) {
	        var color = this.getColor(feature, visualVariables.colorInfo);
	        if (color) {
	          this._styles.color = this.colorValue(color);
	          this._styles.opacity = this.alphaValue(color);
	        }
	      }
	    }
	    return this._styles;
	  }
	});

	function lineSymbol (symbolJson, options) {
	  return new LineSymbol(symbolJson, options);
	}

	var PolygonSymbol = Symbol.extend({
	  statics: {
	    // not implemented: 'esriSFSBackwardDiagonal','esriSFSCross','esriSFSDiagonalCross','esriSFSForwardDiagonal','esriSFSHorizontal','esriSFSNull','esriSFSVertical'
	    POLYGONTYPES: ['esriSFSSolid']
	  },
	  initialize: function (symbolJson, options) {
	    Symbol.prototype.initialize.call(this, symbolJson, options);
	    if (symbolJson) {
	      if (symbolJson.outline && symbolJson.outline.style === 'esriSLSNull') {
	        this._lineStyles = { weight: 0 };
	      } else {
	        this._lineStyles = lineSymbol(symbolJson.outline, options).style();
	      }
	      this._fillStyles();
	    }
	  },

	  _fillStyles: function () {
	    if (this._lineStyles) {
	      if (this._lineStyles.weight === 0) {
	        // when weight is 0, setting the stroke to false can still look bad
	        // (gaps between the polygons)
	        this._styles.stroke = false;
	      } else {
	        // copy the line symbol styles into this symbol's styles
	        for (var styleAttr in this._lineStyles) {
	          this._styles[styleAttr] = this._lineStyles[styleAttr];
	        }
	      }
	    }

	    // set the fill for the polygon
	    if (this._symbolJson) {
	      if (this._symbolJson.color &&
	          // don't fill polygon if type is not supported
	          PolygonSymbol.POLYGONTYPES.indexOf(this._symbolJson.style >= 0)) {
	        this._styles.fill = true;
	        this._styles.fillColor = this.colorValue(this._symbolJson.color);
	        this._styles.fillOpacity = this.alphaValue(this._symbolJson.color);
	      } else {
	        this._styles.fill = false;
	        this._styles.fillOpacity = 0;
	      }
	    }
	  },

	  style: function (feature, visualVariables) {
	    if (!this._isDefault && visualVariables && visualVariables.colorInfo) {
	      var color = this.getColor(feature, visualVariables.colorInfo);
	      if (color) {
	        this._styles.fillColor = this.colorValue(color);
	        this._styles.fillOpacity = this.alphaValue(color);
	      }
	    }
	    return this._styles;
	  }
	});

	function polygonSymbol (symbolJson, options) {
	  return new PolygonSymbol(symbolJson, options);
	}

	var Renderer$1 = L.Class.extend({
	  options: {
	    proportionalPolygon: false,
	    clickable: true
	  },

	  initialize: function (rendererJson, options) {
	    this._rendererJson = rendererJson;
	    this._pointSymbols = false;
	    this._symbols = [];
	    this._visualVariables = this._parseVisualVariables(rendererJson.visualVariables);
	    L.Util.setOptions(this, options);
	  },

	  _parseVisualVariables: function (visualVariables) {
	    var visVars = {};
	    if (visualVariables) {
	      for (var i = 0; i < visualVariables.length; i++) {
	        visVars[visualVariables[i].type] = visualVariables[i];
	      }
	    }
	    return visVars;
	  },

	  _createDefaultSymbol: function () {
	    if (this._rendererJson.defaultSymbol) {
	      this._defaultSymbol = this._newSymbol(this._rendererJson.defaultSymbol);
	      this._defaultSymbol._isDefault = true;
	    }
	  },

	  _newSymbol: function (symbolJson) {
	    if (symbolJson.type === 'esriSMS' || symbolJson.type === 'esriPMS') {
	      this._pointSymbols = true;
	      return pointSymbol(symbolJson, this.options);
	    }
	    if (symbolJson.type === 'esriSLS') {
	      return lineSymbol(symbolJson, this.options);
	    }
	    if (symbolJson.type === 'esriSFS') {
	      return polygonSymbol(symbolJson, this.options);
	    }
	  },

	  _getSymbol: function () {
	    // override
	  },

	  attachStylesToLayer: function (layer) {
	    if (this._pointSymbols) {
	      layer.options.pointToLayer = L.Util.bind(this.pointToLayer, this);
	    } else {
	      layer.options.style = L.Util.bind(this.style, this);
	      layer._originalStyle = layer.options.style;
	    }
	  },

	  pointToLayer: function (geojson, latlng) {
	    var sym = this._getSymbol(geojson);
	    if (sym && sym.pointToLayer) {
	      // right now custom panes are the only option pushed through
	      return sym.pointToLayer(geojson, latlng, this._visualVariables, this.options);
	    }
	    // invisible symbology
	    return L.circleMarker(latlng, {radius: 0, opacity: 0});
	  },

	  style: function (feature) {
	    var userStyles;
	    if (this.options.userDefinedStyle) {
	      userStyles = this.options.userDefinedStyle(feature);
	    }
	    // find the symbol to represent this feature
	    var sym = this._getSymbol(feature);
	    if (sym) {
	      return this.mergeStyles(sym.style(feature, this._visualVariables), userStyles);
	    } else {
	      // invisible symbology
	      return this.mergeStyles({opacity: 0, fillOpacity: 0}, userStyles);
	    }
	  },

	  mergeStyles: function (styles, userStyles) {
	    var mergedStyles = {};
	    var attr;
	    // copy renderer style attributes
	    for (attr in styles) {
	      if (styles.hasOwnProperty(attr)) {
	        mergedStyles[attr] = styles[attr];
	      }
	    }
	    // override with user defined style attributes
	    if (userStyles) {
	      for (attr in userStyles) {
	        if (userStyles.hasOwnProperty(attr)) {
	          mergedStyles[attr] = userStyles[attr];
	        }
	      }
	    }
	    return mergedStyles;
	  }
	});

	var ClassBreaksRenderer = Renderer$1.extend({
	  initialize: function (rendererJson, options) {
	    Renderer$1.prototype.initialize.call(this, rendererJson, options);
	    this._field = this._rendererJson.field;
	    if (this._rendererJson.normalizationType && this._rendererJson.normalizationType === 'esriNormalizeByField') {
	      this._normalizationField = this._rendererJson.normalizationField;
	    }
	    this._createSymbols();
	  },

	  _createSymbols: function () {
	    var symbol;
	    var classbreaks = this._rendererJson.classBreakInfos;

	    this._symbols = [];

	    // create a symbol for each class break
	    for (var i = classbreaks.length - 1; i >= 0; i--) {
	      if (this.options.proportionalPolygon && this._rendererJson.backgroundFillSymbol) {
	        symbol = this._newSymbol(this._rendererJson.backgroundFillSymbol);
	      } else {
	        symbol = this._newSymbol(classbreaks[i].symbol);
	      }
	      symbol.val = classbreaks[i].classMaxValue;
	      this._symbols.push(symbol);
	    }
	    // sort the symbols in ascending value
	    this._symbols.sort(function (a, b) {
	      return a.val > b.val ? 1 : -1;
	    });
	    this._createDefaultSymbol();
	    this._maxValue = this._symbols[this._symbols.length - 1].val;
	  },

	  _getSymbol: function (feature) {
	    var val = feature.properties[this._field];
	    if (this._normalizationField) {
	      var normValue = feature.properties[this._normalizationField];
	      if (!isNaN(normValue) && normValue !== 0) {
	        val = val / normValue;
	      } else {
	        return this._defaultSymbol;
	      }
	    }

	    if (val > this._maxValue) {
	      return this._defaultSymbol;
	    }
	    var symbol = this._symbols[0];
	    for (var i = this._symbols.length - 1; i >= 0; i--) {
	      if (val > this._symbols[i].val) {
	        break;
	      }
	      symbol = this._symbols[i];
	    }
	    return symbol;
	  }
	});

	function classBreaksRenderer (rendererJson, options) {
	  return new ClassBreaksRenderer(rendererJson, options);
	}

	var UniqueValueRenderer = Renderer$1.extend({
	  initialize: function (rendererJson, options) {
	    Renderer$1.prototype.initialize.call(this, rendererJson, options);
	    this._field = this._rendererJson.field1;
	    this._createSymbols();
	  },

	  _createSymbols: function () {
	    var symbol;
	    var uniques = this._rendererJson.uniqueValueInfos;

	    // create a symbol for each unique value
	    for (var i = uniques.length - 1; i >= 0; i--) {
	      symbol = this._newSymbol(uniques[i].symbol);
	      symbol.val = uniques[i].value;
	      this._symbols.push(symbol);
	    }
	    this._createDefaultSymbol();
	  },

	  _getSymbol: function (feature) {
	    var val = feature.properties[this._field];
	    // accumulate values if there is more than one field defined
	    if (this._rendererJson.fieldDelimiter && this._rendererJson.field2) {
	      var val2 = feature.properties[this._rendererJson.field2];
	      if (val2) {
	        val += this._rendererJson.fieldDelimiter + val2;
	        var val3 = feature.properties[this._rendererJson.field3];
	        if (val3) {
	          val += this._rendererJson.fieldDelimiter + val3;
	        }
	      }
	    }

	    var symbol = this._defaultSymbol;
	    for (var i = this._symbols.length - 1; i >= 0; i--) {
	      // using the === operator does not work if the field
	      // of the unique renderer is not a string
	      /*eslint-disable */
	      if (this._symbols[i].val == val) {
	        symbol = this._symbols[i];
	      }
	      /*eslint-enable */
	    }
	    return symbol;
	  }
	});

	function uniqueValueRenderer (rendererJson, options) {
	  return new UniqueValueRenderer(rendererJson, options);
	}

	var SimpleRenderer = Renderer$1.extend({
	  initialize: function (rendererJson, options) {
	    Renderer$1.prototype.initialize.call(this, rendererJson, options);
	    this._createSymbol();
	  },

	  _createSymbol: function () {
	    if (this._rendererJson.symbol) {
	      this._symbols.push(this._newSymbol(this._rendererJson.symbol));
	    }
	  },

	  _getSymbol: function () {
	    return this._symbols[0];
	  }
	});

	function simpleRenderer (rendererJson, options) {
	  return new SimpleRenderer(rendererJson, options);
	}

	function setRenderer (layerDefinition, layer) {
	  var rend;
	  var rendererInfo = layerDefinition.drawingInfo.renderer;

	  var options = {};

	  if (layer.options.pane) {
	    options.pane = layer.options.pane;
	  }
	  if (layerDefinition.drawingInfo.transparency) {
	    options.layerTransparency = layerDefinition.drawingInfo.transparency;
	  }
	  if (layer.options.style) {
	    options.userDefinedStyle = layer.options.style;
	  }

	  switch (rendererInfo.type) {
	    case 'classBreaks':
	      checkForProportionalSymbols(layerDefinition.geometryType, rendererInfo, layer);
	      if (layer._hasProportionalSymbols) {
	        layer._createPointLayer();
	        var pRend = classBreaksRenderer(rendererInfo, options);
	        pRend.attachStylesToLayer(layer._pointLayer);
	        options.proportionalPolygon = true;
	      }
	      rend = classBreaksRenderer(rendererInfo, options);
	      break;
	    case 'uniqueValue':
	      console.log(rendererInfo, options);
	      rend = uniqueValueRenderer(rendererInfo, options);
	      break;
	    default:
	      rend = simpleRenderer(rendererInfo, options);
	  }
	  rend.attachStylesToLayer(layer);
	}

	function checkForProportionalSymbols (geometryType, renderer, layer) {
	  layer._hasProportionalSymbols = false;
	  if (geometryType === 'esriGeometryPolygon') {
	    if (renderer.backgroundFillSymbol) {
	      layer._hasProportionalSymbols = true;
	    }
	    // check to see if the first symbol in the classbreaks is a marker symbol
	    if (renderer.classBreakInfos && renderer.classBreakInfos.length) {
	      var sym = renderer.classBreakInfos[0].symbol;
	      if (sym && (sym.type === 'esriSMS' || sym.type === 'esriPMS')) {
	        layer._hasProportionalSymbols = true;
	      }
	    }
	  }
	}

	var FeatureCollection = L.GeoJSON.extend({
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
	    var index = 0;
	    for (i = 0, len = data.layers.length; i < len; i++) {
	      if (data.layers[i].featureSet.features.length > 0) {
	        index = i;
	      }
	    }
	    var features = data.layers[index].featureSet.features;
	    var geometryType = data.layers[index].layerDefinition.geometryType; // 'esriGeometryPoint' | 'esriGeometryMultipoint' | 'esriGeometryPolyline' | 'esriGeometryPolygon' | 'esriGeometryEnvelope'
	    var objectIdField = data.layers[index].layerDefinition.objectIdField;
	    var layerDefinition = data.layers[index].layerDefinition || null;

	    if (data.layers[index].layerDefinition.extent.spatialReference.wkid !== 4326) {
	      if (data.layers[index].layerDefinition.extent.spatialReference.wkid !== 102100) {
	        console.error('[L.esri.WebMap] this wkid (' + data.layers[index].layerDefinition.extent.spatialReference.wkid + ') is not supported.');
	      }
	      features = this._projTo4326(features, geometryType);
	    }
	    if (data.layers[index].popupInfo !== undefined) {
	      this.popupInfo = data.layers[index].popupInfo;
	    }
	    if (data.layers[index].layerDefinition.drawingInfo.labelingInfo !== undefined) {
	      this.labelingInfo = data.layers[index].layerDefinition.drawingInfo.labelingInfo;
	    }
	    console.log(data);

	    var geojson = this._featureCollectionToGeoJSON(features, objectIdField);

	    if (layerDefinition !== null) {
	      setRenderer(layerDefinition, this);
	    }
	    console.log(geojson);
	    this.addData(geojson);
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

	function featureCollection (geojson, options) {
	  return new FeatureCollection(geojson, options);
	}

	var CSVLayer = L.GeoJSON.extend({
	  options: {
	    url: '',
	    data: {}, // Esri Feature Collection JSON or Item ID
	    opacity: 1
	  },

	  initialize: function (layers, options) {
	    L.setOptions(this, options);

	    this.url = this.options.url;
	    this.layerDefinition = this.options.layerDefinition;
	    this.locationInfo = this.options.locationInfo;
	    this.opacity = this.options.opacity;
	    this._layers = {};

	    var i, len;

	    if (layers) {
	      for (i = 0, len = layers.length; i < len; i++) {
	        this.addLayer(layers[i]);
	      }
	    }

	    this._parseCSV(this.url, this.layerDefinition, this.locationInfo);
	  },

	  _parseCSV: function (url, layerDefinition, locationInfo) {
	    omnivore.csv(url, {
	      latfield: locationInfo.latitudeFieldName,
	      lonfield: locationInfo.longitudeFieldName
	    }, this);

	    setRenderer(layerDefinition, this);
	  }
	});

	function csvLayer (geojson, options) {
	  return new CSVLayer(geojson, options);
	}

	var KMLLayer = L.GeoJSON.extend({
	  options: {
	    opacity: 1,
	    url: ''
	  },

	  initialize: function (layers, options) {
	    L.setOptions(this, options);

	    this.url = this.options.url;
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

	    this._getKML(this.url);
	  },

	  _getKML: function (url) {
	    var requestUrl = 'http://utility.arcgis.com/sharing/kml?url=' + url + '&model=simple&folders=&outSR=%7B"wkid"%3A4326%7D';
	    L.esri.request(requestUrl, {}, function (err, res) {
	      if (err) {
	        console.log(err);
	      } else {
	        console.log(res);
	        this._parseFeatureCollection(res.featureCollection);
	      }
	    }, this);
	  },

	  _parseFeatureCollection: function (featureCollection) {
	    console.log('_parseFeatureCollection');
	    var i;
	    for (i = 0; i < 3; i++) {
	      if (featureCollection.layers[i].featureSet.features.length > 0) {
	        console.log(i);
	        var features = featureCollection.layers[i].featureSet.features;
	        var objectIdField = featureCollection.layers[i].layerDefinition.objectIdField;

	        var geojson = this._featureCollectionToGeoJSON(features, objectIdField);

	        if (featureCollection.layers[i].popupInfo !== undefined) {
	          this.popupInfo = featureCollection.layers[i].popupInfo;
	        }
	        if (featureCollection.layers[i].layerDefinition.drawingInfo.labelingInfo !== undefined) {
	          this.labelingInfo = featureCollection.layers[i].layerDefinition.drawingInfo.labelingInfo;
	        }

	        setRenderer(featureCollection.layers[i].layerDefinition, this);
	        console.log(geojson);
	        this.addData(geojson);
	      }
	    }
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

	function kmlLayer (geojson, options) {
	  return new KMLLayer(geojson, options);
	}

	var LabelIcon = L.DivIcon.extend({
	  options: {
	    iconSize: null,
	    className: 'esri-leaflet-webmap-labels',
	    text: ''
	  },

	  createIcon: function (oldIcon) {
	    var div = (oldIcon && oldIcon.tagName === 'DIV') ? oldIcon : document.createElement('div');
	    var options = this.options;

	    div.innerHTML = '<div style="position: relative; left: -50%; text-shadow: 1px 1px 0px #fff, -1px 1px 0px #fff, 1px -1px 0px #fff, -1px -1px 0px #fff;">' + options.text + '</div>';

	    // label.css
	    div.style.fontSize = '1em';
	    div.style.fontWeight = 'bold';
	    div.style.textTransform = 'uppercase';
	    div.style.textAlign = 'center';
	    div.style.whiteSpace = 'nowrap';

	    if (options.bgPos) {
	      var bgPos = L.point(options.bgPos);
	      div.style.backgroundPosition = (-bgPos.x) + 'px ' + (-bgPos.y) + 'px';
	    }
	    this._setIconStyles(div, 'icon');

	    return div;
	  }
	});

	function labelIcon (options) {
	  return new LabelIcon(options);
	}

	var LabelMarker = L.Marker.extend({
	  options: {
	    properties: {},
	    labelingInfo: {},
	    offset: [0, 0]
	  },

	  initialize: function (latlng, options) {
	    L.setOptions(this, options);
	    this._latlng = L.latLng(latlng);

	    var labelText = this._createLabelText(this.options.properties, this.options.labelingInfo);
	    this._setLabelIcon(labelText, this.options.offset);
	  },

	  _createLabelText: function (properties, labelingInfo) {
	    var r = /\[([^\]]*)\]/g;
	    var labelText = labelingInfo[0].labelExpression;

	    labelText = labelText.replace(r, function (s) {
	      var m = r.exec(s);
	      return properties[m[1]];
	    });

	    return labelText;
	  },

	  _setLabelIcon: function (text, offset) {
	    var icon = labelIcon({
	      text: text,
	      iconAnchor: offset
	    });

	    this.setIcon(icon);
	  }
	});

	function labelMarker (latlng, options) {
	  return new LabelMarker(latlng, options);
	}

	function pointLabelPos (coordinates) {
	  var labelPos = { position: [], offset: [] };

	  labelPos.position = coordinates.reverse();
	  labelPos.offset = [20, 20];

	  return labelPos;
	}

	function polylineLabelPos (coordinates) {
	  var labelPos = { position: [], offset: [] };
	  var centralKey;

	  centralKey = Math.round(coordinates.length / 2);
	  labelPos.position = coordinates[centralKey].reverse();
	  labelPos.offset = [0, 0];

	  return labelPos;
	}

	function polygonLabelPos (layer, coordinates) {
	  var labelPos = { position: [], offset: [] };

	  labelPos.position = layer.getBounds().getCenter();
	  labelPos.offset = [0, 0];

	  return labelPos;
	}

	function createPopupContent (popupInfo, properties) {
	  // console.log(popupInfo, properties);
	  var r = /\{([^\]]*)\}/g;
	  var titleText = '';
	  var content = '';

	  if (popupInfo.title !== undefined) {
	    titleText = popupInfo.title;
	  }

	  titleText = titleText.replace(r, function (s) {
	    var m = r.exec(s);
	    return properties[m[1]];
	  });

	  content = '<div class="leaflet-popup-content-title"><h4>' + titleText + '</h4></div><div class="leaflet-popup-content-description" style="max-height:200px;overflow:auto;">';

	  if (popupInfo.fieldInfos !== undefined) {
	    for (var i = 0; i < popupInfo.fieldInfos.length; i++) {
	      if (popupInfo.fieldInfos[i].visible === true) {
	        content += '<div style="font-weight:bold;color:#999;margin-top:5px;word-break:break-all;">' + popupInfo.fieldInfos[i].label + '</div><p style="margin-top:0;margin-bottom:5px;word-break:break-all;">' + properties[popupInfo.fieldInfos[i].fieldName] + '</p>';
	      }
	    }
	    content += '</div>';
	  } else if (popupInfo.description !== undefined) {
	    // KMLLayer popup
	    var descriptionText = popupInfo.description.replace(r, function (s) {
	      var m = r.exec(s);
	      return properties[m[1]];
	    });
	    content += descriptionText + '</div>';
	  }

	  // if (popupInfo.mediaInfos.length > 0) {
	    // It does not support mediaInfos for popup contents.
	  // }

	  return content;
	}

	function operationalLayer (layer, layers, map, params, paneName) {
	  return _generateEsriLayer(layer, layers, map, params, paneName);
	}

	function _generateEsriLayer (layer, layers, map, params, paneName) {
	  console.log('generateEsriLayer: ', layer.title, layer);
	  var lyr;
	  var labels = [];
	  var labelsLayer;
	  var labelPaneName = paneName + '-label';
	  var i, len;

	  if (layer.type === 'Feature Collection' || layer.featureCollection !== undefined) {
	    console.log('create FeatureCollection');

	    map.createPane(labelPaneName);

	    var popupInfo, labelingInfo;
	    if (layer.itemId === undefined) {
	      for (i = 0, len = layer.featureCollection.layers.length; i < len; i++) {
	        if (layer.featureCollection.layers[i].featureSet.features.length > 0) {
	          if (layer.featureCollection.layers[i].popupInfo !== undefined && layer.featureCollection.layers[i].popupInfo !== null) {
	            popupInfo = layer.featureCollection.layers[i].popupInfo;
	          }
	          if (layer.featureCollection.layers[i].layerDefinition.drawingInfo.labelingInfo !== undefined && layer.featureCollection.layers[i].layerDefinition.drawingInfo.labelingInfo !== null) {
	            labelingInfo = layer.featureCollection.layers[i].layerDefinition.drawingInfo.labelingInfo;
	          }
	        }
	      }
	    }

	    labelsLayer = L.featureGroup(labels);
	    var fc = featureCollection(null, {
	      data: layer.itemId || layer.featureCollection,
	      opacity: layer.opacity,
	      pane: paneName,
	      onEachFeature: function (geojson, l) {
	        if (fc !== undefined) {
	          popupInfo = fc.popupInfo;
	          labelingInfo = fc.labelingInfo;
	        }
	        if (popupInfo !== undefined && popupInfo !== null) {
	          var popupContent = createPopupContent(popupInfo, geojson.properties);
	          l.bindPopup(popupContent);
	        }
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
	            pane: labelPaneName
	          });

	          labelsLayer.addLayer(label);
	        }
	      }
	    });

	    lyr = L.layerGroup([fc, labelsLayer]);

	    layers.push({ type: 'FC', title: layer.title || '', layer: lyr });

	    return lyr;
	  } else if (layer.layerType === 'ArcGISFeatureLayer' && layer.layerDefinition !== undefined) {
	    var where = '1=1';
	    if (layer.layerDefinition.drawingInfo !== undefined) {
	      if (layer.layerDefinition.drawingInfo.renderer.type === 'heatmap') {
	        console.log('create HeatmapLayer');
	        var gradient = {};

	        layer.layerDefinition.drawingInfo.renderer.colorStops.map(function (stop) {
	          // gradient[stop.ratio] = 'rgba(' + stop.color[0] + ',' + stop.color[1] + ',' + stop.color[2] + ',' + (stop.color[3]/255) + ')';
	          // gradient[Math.round(stop.ratio*100)/100] = 'rgb(' + stop.color[0] + ',' + stop.color[1] + ',' + stop.color[2] + ')';
	          gradient[(Math.round(stop.ratio * 100) / 100 + 6) / 7] = 'rgb(' + stop.color[0] + ',' + stop.color[1] + ',' + stop.color[2] + ')';
	        });

	        lyr = L.esri.Heat.heatmapFeatureLayer({ // Esri Leaflet 2.0
	        // lyr = L.esri.heatmapFeatureLayer({ // Esri Leaflet 1.0
	          url: layer.url,
	          token: params.token || null,
	          minOpacity: 0.5,
	          max: layer.layerDefinition.drawingInfo.renderer.maxPixelIntensity,
	          blur: layer.layerDefinition.drawingInfo.renderer.blurRadius,
	          radius: layer.layerDefinition.drawingInfo.renderer.blurRadius * 1.3,
	          gradient: gradient,
	          pane: paneName
	        });

	        layers.push({ type: 'HL', title: layer.title || '', layer: lyr });

	        return lyr;
	      } else {
	        console.log('create ArcGISFeatureLayer (with layerDefinition.drawingInfo)');
	        var drawingInfo = layer.layerDefinition.drawingInfo;
	        drawingInfo.transparency = 100 - (layer.opacity * 100);
	        console.log(drawingInfo.transparency);

	        if (layer.layerDefinition.definitionExpression !== undefined) {
	          where = layer.layerDefinition.definitionExpression;
	        }

	        map.createPane(labelPaneName);

	        labelsLayer = L.featureGroup(labels);

	        lyr = L.esri.featureLayer({
	          url: layer.url,
	          where: where,
	          token: params.token || null,
	          drawingInfo: drawingInfo,
	          pane: paneName,
	          onEachFeature: function (geojson, l) {
	            if (layer.popupInfo !== undefined) {
	              var popupContent = createPopupContent(layer.popupInfo, geojson.properties);
	              l.bindPopup(popupContent);
	            }
	            if (layer.layerDefinition.drawingInfo.labelingInfo !== undefined && layer.layerDefinition.drawingInfo.labelingInfo !== null) {
	              var labelingInfo = layer.layerDefinition.drawingInfo.labelingInfo;
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
	                pane: labelPaneName
	              });

	              labelsLayer.addLayer(label);
	            }
	          }
	        });

	        lyr = L.layerGroup([lyr, labelsLayer]);

	        layers.push({ type: 'FL', title: layer.title || '', layer: lyr });

	        return lyr;
	      }
	    } else {
	      console.log('create ArcGISFeatureLayer (without layerDefinition.drawingInfo)');

	      if (layer.layerDefinition.definitionExpression !== undefined) {
	        where = layer.layerDefinition.definitionExpression;
	      }

	      lyr = L.esri.featureLayer({
	        url: layer.url,
	        token: params.token || null,
	        where: where,
	        pane: paneName,
	        onEachFeature: function (geojson, l) {
	          if (layer.popupInfo !== undefined) {
	            var popupContent = createPopupContent(layer.popupInfo, geojson.properties);
	            l.bindPopup(popupContent);
	          }
	        }
	      });

	      layers.push({ type: 'FL', title: layer.title || '', layer: lyr });

	      return lyr;
	    }
	  } else if (layer.layerType === 'ArcGISFeatureLayer') {
	    console.log('create ArcGISFeatureLayer');
	    lyr = L.esri.featureLayer({
	      url: layer.url,
	      token: params.token || null,
	      pane: paneName,
	      onEachFeature: function (geojson, l) {
	        if (layer.popupInfo !== undefined) {
	          var popupContent = createPopupContent(layer.popupInfo, geojson.properties);
	          l.bindPopup(popupContent);
	        }
	      }
	    });

	    layers.push({ type: 'FL', title: layer.title || '', layer: lyr });

	    return lyr;
	  } else if (layer.layerType === 'CSV') {
	    labelsLayer = L.featureGroup(labels);
	    lyr = csvLayer(null, {
	      url: layer.url,
	      layerDefinition: layer.layerDefinition,
	      locationInfo: layer.locationInfo,
	      opacity: layer.opacity,
	      pane: paneName,
	      onEachFeature: function (geojson, l) {
	        if (layer.popupInfo !== undefined) {
	          var popupContent = createPopupContent(layer.popupInfo, geojson.properties);
	          l.bindPopup(popupContent);
	        }
	        if (layer.layerDefinition.drawingInfo.labelingInfo !== undefined && layer.layerDefinition.drawingInfo.labelingInfo !== null) {
	          var labelingInfo = layer.layerDefinition.drawingInfo.labelingInfo;
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
	            pane: labelPaneName
	          });

	          labelsLayer.addLayer(label);
	        }
	      }
	    });

	    lyr = L.layerGroup([lyr, labelsLayer]);

	    layers.push({ type: 'CSV', title: layer.title || '', layer: lyr });

	    return lyr;
	  } else if (layer.layerType === 'KML') {
	    labelsLayer = L.featureGroup(labels);
	    var kml = kmlLayer(null, {
	      url: layer.url,
	      opacity: layer.opacity,
	      pane: paneName,
	      onEachFeature: function (geojson, l) {
	        if (kml.popupInfo !== undefined && kml.popupInfo !== null) {
	          console.log(kml.popupInfo);
	          var popupContent = createPopupContent(kml.popupInfo, geojson.properties);
	          l.bindPopup(popupContent);
	        }
	        if (kml.labelingInfo !== undefined && kml.labelingInfo !== null) {
	          var labelingInfo = kml.labelingInfo;
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
	            pane: labelPaneName
	          });

	          labelsLayer.addLayer(label);
	        }
	      }
	    });

	    lyr = L.layerGroup([kml, labelsLayer]);

	    layers.push({ type: 'KML', title: layer.title || '', layer: lyr });

	    return lyr;
	  } else if (layer.layerType === 'ArcGISImageServiceLayer') {
	    console.log('create ArcGISImageServiceLayer');
	    lyr = L.esri.imageMapLayer({
	      url: layer.url,
	      token: params.token || null,
	      pane: paneName,
	      opacity: layer.opacity || 1
	    });

	    layers.push({ type: 'IML', title: layer.title || '', layer: lyr });

	    return lyr;
	  } else if (layer.layerType === 'ArcGISMapServiceLayer') {
	    lyr = L.esri.dynamicMapLayer({
	      url: layer.url,
	      token: params.token || null,
	      pane: paneName,
	      opacity: layer.opacity || 1
	    });

	    layers.push({ type: 'DML', title: layer.title || '', layer: lyr });

	    return lyr;
	  } else if (layer.layerType === 'ArcGISTiledMapServiceLayer') {
	    try {
	      lyr = L.esri.basemapLayer(layer.title);
	    } catch (e) {
	      lyr = L.esri.tiledMapLayer({
	        url: layer.url,
	        token: params.token || null
	      });

	      if (map.options.attributionControl && map.attributionControl) {
	        L.esri.request(layer.url, {}, function (err, res) {
	          if (err) {
	            console.log(err);
	          } else {
	            var maxWidth = (map.getSize().x - 55);
	            var tiledAttribution = '<span class="esri-attributions" style="line-height:14px; vertical-align: -3px; text-overflow:ellipsis; white-space:nowrap; overflow:hidden; display:inline-block; max-width:' + maxWidth + 'px;">' + res.copyrightText + '</span>';
	            map.attributionControl.addAttribution(tiledAttribution);
	          }
	        });
	      }
	    }

	    document.getElementsByClassName('leaflet-tile-pane')[0].style.opacity = layer.opacity || 1;

	    layers.push({ type: 'TML', title: layer.title || '', layer: lyr });

	    return lyr;
	  } else if (layer.layerType === 'VectorTileLayer') {
	    var keys = {
	      'World Street Map (with Relief)': 'StreetsRelief',
	      'World Street Map (with Relief) (Mature Support)': 'StreetsRelief',
	      'Hybrid Reference Layer': 'Hybrid',
	      'Hybrid Reference Layer (Mature Support)': 'Hybrid',
	      'World Street Map': 'Streets',
	      'World Street Map (Mature Support)': 'Streets',
	      'World Street Map (Night)': 'StreetsNight',
	      'World Street Map (Night) (Mature Support)': 'StreetsNight',
	      'Dark Gray Canvas': 'DarkGray',
	      'Dark Gray Canvas (Mature Support)': 'DarkGray',
	      'World Topographic Map': 'Topographic',
	      'World Topographic Map (Mature Support)': 'Topographic',
	      'World Navigation Map': 'Navigation',
	      'World Navigation Map (Mature Support)': 'Navigation',
	      'Light Gray Canvas': 'Gray',
	      'Light Gray Canvas (Mature Support)': 'Gray'
	      //'Terrain with Labels': '',
	      //'World Terrain with Labels': '',
	      //'Light Gray Canvas Reference': '',
	      //'Dark Gray Canvas Reference': '',
	      //'Dark Gray Canvas Base': '',
	      //'Light Gray Canvas Base': ''
	    };

	    if (keys[layer.title]) {
	      lyr = L.esri.Vector.basemap(keys[layer.title]);
	    } else {
	      console.error('Unsupported Vector Tile Layer: ', layer);
	      lyr = L.featureGroup([]);
	    }

	    layers.push({ type: 'VTL', title: layer.title || layer.id || '', layer: lyr });

	    return lyr;
	  } else if (layer.layerType === 'OpenStreetMap') {
	    lyr = L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
	      attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
	    });

	    layers.push({ type: 'TL', title: layer.title || layer.id || '', layer: lyr });

	    return lyr;
	  } else if (layer.layerType === 'WebTiledLayer') {
	    var lyrUrl = _esriWTLUrlTemplateToLeaflet(layer.templateUrl);
	    lyr = L.tileLayer(lyrUrl, {
	      attribution: layer.copyright
	    });
	    document.getElementsByClassName('leaflet-tile-pane')[0].style.opacity = layer.opacity || 1;

	    layers.push({ type: 'TL', title: layer.title || layer.id || '', layer: lyr });

	    return lyr;
	  } else if (layer.layerType === 'WMS') {
	    var layerNames = '';
	    for (i = 0, len = layer.visibleLayers.length; i < len; i++) {
	      layerNames += layer.visibleLayers[i];
	      if (i < len - 1) {
	        layerNames += ',';
	      }
	    }

	    lyr = L.tileLayer.wms(layer.url, {
	      layers: String(layerNames),
	      format: 'image/png',
	      transparent: true,
	      attribution: layer.copyright
	    });

	    layers.push({ type: 'WMS', title: layer.title || layer.id || '', layer: lyr });

	    return lyr;
	  } else {
	    lyr = L.featureGroup([]);
	    console.log('Unsupported Layer: ', layer);
	    return lyr;
	  }
	}

	function _esriWTLUrlTemplateToLeaflet (url) {
	  var newUrl = url;

	  newUrl = newUrl.replace(/\{level}/g, '{z}');
	  newUrl = newUrl.replace(/\{col}/g, '{x}');
	  newUrl = newUrl.replace(/\{row}/g, '{y}');

	  return newUrl;
	}

	var WebMap = L.Evented.extend({
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

	    L.esri.request(webmapMetaDataRequestUrl, params, function (error, response) {
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

	    L.esri.request(webmapRequestUrl, params, function (error, response) {
	      if (error) {
	        console.log(error);
	      } else {
	        console.log('WebMap: ', response);
	        this._layersNum = response.baseMap.baseMapLayers.length + response.operationalLayers.length;

	        // Add Basemap
	        response.baseMap.baseMapLayers.map(function (baseMapLayer) {
	          if (baseMapLayer.itemId !== undefined) {
	            var itemRequestUrl = 'https://' + server + '/sharing/rest/content/items/' + baseMapLayer.itemId;
	            L.esri.request(itemRequestUrl, params, function (err, res) {
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
	            L.esri.request(itemRequestUrl, params, function (err, res) {
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

	function webMap (webmapId, options) {
	  return new WebMap(webmapId, options);
	}

	exports.WebMap = WebMap;
	exports.webMap = webMap;
	exports.operationalLayer = operationalLayer;
	exports.FeatureCollection = FeatureCollection;
	exports.featureCollection = featureCollection;
	exports.LabelMarker = LabelMarker;
	exports.labelMarker = labelMarker;
	exports.LabelIcon = LabelIcon;
	exports.labelIcon = labelIcon;
	exports.createPopupContent = createPopupContent;

	Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjpudWxsLCJzb3VyY2VzIjpbIi4uL25vZGVfbW9kdWxlcy9hcmNnaXMtdG8tZ2VvanNvbi11dGlscy9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9lc3JpLWxlYWZsZXQtcmVuZGVyZXJzL3NyYy9TeW1ib2xzL1N5bWJvbC5qcyIsIi4uL25vZGVfbW9kdWxlcy9sZWFmbGV0LXNoYXBlLW1hcmtlcnMvc3JjL1NoYXBlTWFya2VyLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xlYWZsZXQtc2hhcGUtbWFya2Vycy9zcmMvQ3Jvc3NNYXJrZXIuanMiLCIuLi9ub2RlX21vZHVsZXMvbGVhZmxldC1zaGFwZS1tYXJrZXJzL3NyYy9YTWFya2VyLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xlYWZsZXQtc2hhcGUtbWFya2Vycy9zcmMvU3F1YXJlTWFya2VyLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xlYWZsZXQtc2hhcGUtbWFya2Vycy9zcmMvRGlhbW9uZE1hcmtlci5qcyIsIi4uL25vZGVfbW9kdWxlcy9lc3JpLWxlYWZsZXQtcmVuZGVyZXJzL3NyYy9TeW1ib2xzL1BvaW50U3ltYm9sLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2VzcmktbGVhZmxldC1yZW5kZXJlcnMvc3JjL1N5bWJvbHMvTGluZVN5bWJvbC5qcyIsIi4uL25vZGVfbW9kdWxlcy9lc3JpLWxlYWZsZXQtcmVuZGVyZXJzL3NyYy9TeW1ib2xzL1BvbHlnb25TeW1ib2wuanMiLCIuLi9ub2RlX21vZHVsZXMvZXNyaS1sZWFmbGV0LXJlbmRlcmVycy9zcmMvUmVuZGVyZXJzL1JlbmRlcmVyLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2VzcmktbGVhZmxldC1yZW5kZXJlcnMvc3JjL1JlbmRlcmVycy9DbGFzc0JyZWFrc1JlbmRlcmVyLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2VzcmktbGVhZmxldC1yZW5kZXJlcnMvc3JjL1JlbmRlcmVycy9VbmlxdWVWYWx1ZVJlbmRlcmVyLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2VzcmktbGVhZmxldC1yZW5kZXJlcnMvc3JjL1JlbmRlcmVycy9TaW1wbGVSZW5kZXJlci5qcyIsIi4uL3NyYy9GZWF0dXJlQ29sbGVjdGlvbi9SZW5kZXJlci5qcyIsIi4uL3NyYy9GZWF0dXJlQ29sbGVjdGlvbi9GZWF0dXJlQ29sbGVjdGlvbi5qcyIsIi4uL3NyYy9GZWF0dXJlQ29sbGVjdGlvbi9DU1ZMYXllci5qcyIsIi4uL3NyYy9GZWF0dXJlQ29sbGVjdGlvbi9LTUxMYXllci5qcyIsIi4uL3NyYy9MYWJlbC9MYWJlbEljb24uanMiLCIuLi9zcmMvTGFiZWwvTGFiZWxNYXJrZXIuanMiLCIuLi9zcmMvTGFiZWwvUG9pbnRMYWJlbC5qcyIsIi4uL3NyYy9MYWJlbC9Qb2x5bGluZUxhYmVsLmpzIiwiLi4vc3JjL0xhYmVsL1BvbHlnb25MYWJlbC5qcyIsIi4uL3NyYy9Qb3B1cC9Qb3B1cC5qcyIsIi4uL3NyYy9PcGVyYXRpb25hbExheWVyLmpzIiwiLi4vc3JjL1dlYk1hcExvYWRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IDIwMTUgRXNyaVxuICpcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gKiB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gKiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbiAqXG4gKiAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICogV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGlzY2Vuc2UuXG4gKi9cblxuLy8gY2hlY2tzIGlmIDIgeCx5IHBvaW50cyBhcmUgZXF1YWxcbmZ1bmN0aW9uIHBvaW50c0VxdWFsIChhLCBiKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKykge1xuICAgIGlmIChhW2ldICE9PSBiW2ldKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG4vLyBjaGVja3MgaWYgdGhlIGZpcnN0IGFuZCBsYXN0IHBvaW50cyBvZiBhIHJpbmcgYXJlIGVxdWFsIGFuZCBjbG9zZXMgdGhlIHJpbmdcbmZ1bmN0aW9uIGNsb3NlUmluZyAoY29vcmRpbmF0ZXMpIHtcbiAgaWYgKCFwb2ludHNFcXVhbChjb29yZGluYXRlc1swXSwgY29vcmRpbmF0ZXNbY29vcmRpbmF0ZXMubGVuZ3RoIC0gMV0pKSB7XG4gICAgY29vcmRpbmF0ZXMucHVzaChjb29yZGluYXRlc1swXSk7XG4gIH1cbiAgcmV0dXJuIGNvb3JkaW5hdGVzO1xufVxuXG4vLyBkZXRlcm1pbmUgaWYgcG9seWdvbiByaW5nIGNvb3JkaW5hdGVzIGFyZSBjbG9ja3dpc2UuIGNsb2Nrd2lzZSBzaWduaWZpZXMgb3V0ZXIgcmluZywgY291bnRlci1jbG9ja3dpc2UgYW4gaW5uZXIgcmluZ1xuLy8gb3IgaG9sZS4gdGhpcyBsb2dpYyB3YXMgZm91bmQgYXQgaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8xMTY1NjQ3L2hvdy10by1kZXRlcm1pbmUtaWYtYS1saXN0LW9mLXBvbHlnb24tXG4vLyBwb2ludHMtYXJlLWluLWNsb2Nrd2lzZS1vcmRlclxuZnVuY3Rpb24gcmluZ0lzQ2xvY2t3aXNlIChyaW5nVG9UZXN0KSB7XG4gIHZhciB0b3RhbCA9IDA7XG4gIHZhciBpID0gMDtcbiAgdmFyIHJMZW5ndGggPSByaW5nVG9UZXN0Lmxlbmd0aDtcbiAgdmFyIHB0MSA9IHJpbmdUb1Rlc3RbaV07XG4gIHZhciBwdDI7XG4gIGZvciAoaTsgaSA8IHJMZW5ndGggLSAxOyBpKyspIHtcbiAgICBwdDIgPSByaW5nVG9UZXN0W2kgKyAxXTtcbiAgICB0b3RhbCArPSAocHQyWzBdIC0gcHQxWzBdKSAqIChwdDJbMV0gKyBwdDFbMV0pO1xuICAgIHB0MSA9IHB0MjtcbiAgfVxuICByZXR1cm4gKHRvdGFsID49IDApO1xufVxuXG4vLyBwb3J0ZWQgZnJvbSB0ZXJyYWZvcm1lci5qcyBodHRwczovL2dpdGh1Yi5jb20vRXNyaS9UZXJyYWZvcm1lci9ibG9iL21hc3Rlci90ZXJyYWZvcm1lci5qcyNMNTA0LUw1MTlcbmZ1bmN0aW9uIHZlcnRleEludGVyc2VjdHNWZXJ0ZXggKGExLCBhMiwgYjEsIGIyKSB7XG4gIHZhciB1YVQgPSAoYjJbMF0gLSBiMVswXSkgKiAoYTFbMV0gLSBiMVsxXSkgLSAoYjJbMV0gLSBiMVsxXSkgKiAoYTFbMF0gLSBiMVswXSk7XG4gIHZhciB1YlQgPSAoYTJbMF0gLSBhMVswXSkgKiAoYTFbMV0gLSBiMVsxXSkgLSAoYTJbMV0gLSBhMVsxXSkgKiAoYTFbMF0gLSBiMVswXSk7XG4gIHZhciB1QiA9IChiMlsxXSAtIGIxWzFdKSAqIChhMlswXSAtIGExWzBdKSAtIChiMlswXSAtIGIxWzBdKSAqIChhMlsxXSAtIGExWzFdKTtcblxuICBpZiAodUIgIT09IDApIHtcbiAgICB2YXIgdWEgPSB1YVQgLyB1QjtcbiAgICB2YXIgdWIgPSB1YlQgLyB1QjtcblxuICAgIGlmICh1YSA+PSAwICYmIHVhIDw9IDEgJiYgdWIgPj0gMCAmJiB1YiA8PSAxKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZmFsc2U7XG59XG5cbi8vIHBvcnRlZCBmcm9tIHRlcnJhZm9ybWVyLmpzIGh0dHBzOi8vZ2l0aHViLmNvbS9Fc3JpL1RlcnJhZm9ybWVyL2Jsb2IvbWFzdGVyL3RlcnJhZm9ybWVyLmpzI0w1MjEtTDUzMVxuZnVuY3Rpb24gYXJyYXlJbnRlcnNlY3RzQXJyYXkgKGEsIGIpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhLmxlbmd0aCAtIDE7IGkrKykge1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgYi5sZW5ndGggLSAxOyBqKyspIHtcbiAgICAgIGlmICh2ZXJ0ZXhJbnRlcnNlY3RzVmVydGV4KGFbaV0sIGFbaSArIDFdLCBiW2pdLCBiW2ogKyAxXSkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vLyBwb3J0ZWQgZnJvbSB0ZXJyYWZvcm1lci5qcyBodHRwczovL2dpdGh1Yi5jb20vRXNyaS9UZXJyYWZvcm1lci9ibG9iL21hc3Rlci90ZXJyYWZvcm1lci5qcyNMNDcwLUw0ODBcbmZ1bmN0aW9uIGNvb3JkaW5hdGVzQ29udGFpblBvaW50IChjb29yZGluYXRlcywgcG9pbnQpIHtcbiAgdmFyIGNvbnRhaW5zID0gZmFsc2U7XG4gIGZvciAodmFyIGkgPSAtMSwgbCA9IGNvb3JkaW5hdGVzLmxlbmd0aCwgaiA9IGwgLSAxOyArK2kgPCBsOyBqID0gaSkge1xuICAgIGlmICgoKGNvb3JkaW5hdGVzW2ldWzFdIDw9IHBvaW50WzFdICYmIHBvaW50WzFdIDwgY29vcmRpbmF0ZXNbal1bMV0pIHx8XG4gICAgICAgICAoY29vcmRpbmF0ZXNbal1bMV0gPD0gcG9pbnRbMV0gJiYgcG9pbnRbMV0gPCBjb29yZGluYXRlc1tpXVsxXSkpICYmXG4gICAgICAgIChwb2ludFswXSA8IChjb29yZGluYXRlc1tqXVswXSAtIGNvb3JkaW5hdGVzW2ldWzBdKSAqIChwb2ludFsxXSAtIGNvb3JkaW5hdGVzW2ldWzFdKSAvIChjb29yZGluYXRlc1tqXVsxXSAtIGNvb3JkaW5hdGVzW2ldWzFdKSArIGNvb3JkaW5hdGVzW2ldWzBdKSkge1xuICAgICAgY29udGFpbnMgPSAhY29udGFpbnM7XG4gICAgfVxuICB9XG4gIHJldHVybiBjb250YWlucztcbn1cblxuLy8gcG9ydGVkIGZyb20gdGVycmFmb3JtZXItYXJjZ2lzLXBhcnNlci5qcyBodHRwczovL2dpdGh1Yi5jb20vRXNyaS90ZXJyYWZvcm1lci1hcmNnaXMtcGFyc2VyL2Jsb2IvbWFzdGVyL3RlcnJhZm9ybWVyLWFyY2dpcy1wYXJzZXIuanMjTDEwNi1MMTEzXG5mdW5jdGlvbiBjb29yZGluYXRlc0NvbnRhaW5Db29yZGluYXRlcyAob3V0ZXIsIGlubmVyKSB7XG4gIHZhciBpbnRlcnNlY3RzID0gYXJyYXlJbnRlcnNlY3RzQXJyYXkob3V0ZXIsIGlubmVyKTtcbiAgdmFyIGNvbnRhaW5zID0gY29vcmRpbmF0ZXNDb250YWluUG9pbnQob3V0ZXIsIGlubmVyWzBdKTtcbiAgaWYgKCFpbnRlcnNlY3RzICYmIGNvbnRhaW5zKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vLyBkbyBhbnkgcG9seWdvbnMgaW4gdGhpcyBhcnJheSBjb250YWluIGFueSBvdGhlciBwb2x5Z29ucyBpbiB0aGlzIGFycmF5P1xuLy8gdXNlZCBmb3IgY2hlY2tpbmcgZm9yIGhvbGVzIGluIGFyY2dpcyByaW5nc1xuLy8gcG9ydGVkIGZyb20gdGVycmFmb3JtZXItYXJjZ2lzLXBhcnNlci5qcyBodHRwczovL2dpdGh1Yi5jb20vRXNyaS90ZXJyYWZvcm1lci1hcmNnaXMtcGFyc2VyL2Jsb2IvbWFzdGVyL3RlcnJhZm9ybWVyLWFyY2dpcy1wYXJzZXIuanMjTDExNy1MMTcyXG5mdW5jdGlvbiBjb252ZXJ0UmluZ3NUb0dlb0pTT04gKHJpbmdzKSB7XG4gIHZhciBvdXRlclJpbmdzID0gW107XG4gIHZhciBob2xlcyA9IFtdO1xuICB2YXIgeDsgLy8gaXRlcmF0b3JcbiAgdmFyIG91dGVyUmluZzsgLy8gY3VycmVudCBvdXRlciByaW5nIGJlaW5nIGV2YWx1YXRlZFxuICB2YXIgaG9sZTsgLy8gY3VycmVudCBob2xlIGJlaW5nIGV2YWx1YXRlZFxuXG4gIC8vIGZvciBlYWNoIHJpbmdcbiAgZm9yICh2YXIgciA9IDA7IHIgPCByaW5ncy5sZW5ndGg7IHIrKykge1xuICAgIHZhciByaW5nID0gY2xvc2VSaW5nKHJpbmdzW3JdLnNsaWNlKDApKTtcbiAgICBpZiAocmluZy5sZW5ndGggPCA0KSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgLy8gaXMgdGhpcyByaW5nIGFuIG91dGVyIHJpbmc/IGlzIGl0IGNsb2Nrd2lzZT9cbiAgICBpZiAocmluZ0lzQ2xvY2t3aXNlKHJpbmcpKSB7XG4gICAgICB2YXIgcG9seWdvbiA9IFsgcmluZyBdO1xuICAgICAgb3V0ZXJSaW5ncy5wdXNoKHBvbHlnb24pOyAvLyBwdXNoIHRvIG91dGVyIHJpbmdzXG4gICAgfSBlbHNlIHtcbiAgICAgIGhvbGVzLnB1c2gocmluZyk7IC8vIGNvdW50ZXJjbG9ja3dpc2UgcHVzaCB0byBob2xlc1xuICAgIH1cbiAgfVxuXG4gIHZhciB1bmNvbnRhaW5lZEhvbGVzID0gW107XG5cbiAgLy8gd2hpbGUgdGhlcmUgYXJlIGhvbGVzIGxlZnQuLi5cbiAgd2hpbGUgKGhvbGVzLmxlbmd0aCkge1xuICAgIC8vIHBvcCBhIGhvbGUgb2ZmIG91dCBzdGFja1xuICAgIGhvbGUgPSBob2xlcy5wb3AoKTtcblxuICAgIC8vIGxvb3Agb3ZlciBhbGwgb3V0ZXIgcmluZ3MgYW5kIHNlZSBpZiB0aGV5IGNvbnRhaW4gb3VyIGhvbGUuXG4gICAgdmFyIGNvbnRhaW5lZCA9IGZhbHNlO1xuICAgIGZvciAoeCA9IG91dGVyUmluZ3MubGVuZ3RoIC0gMTsgeCA+PSAwOyB4LS0pIHtcbiAgICAgIG91dGVyUmluZyA9IG91dGVyUmluZ3NbeF1bMF07XG4gICAgICBpZiAoY29vcmRpbmF0ZXNDb250YWluQ29vcmRpbmF0ZXMob3V0ZXJSaW5nLCBob2xlKSkge1xuICAgICAgICAvLyB0aGUgaG9sZSBpcyBjb250YWluZWQgcHVzaCBpdCBpbnRvIG91ciBwb2x5Z29uXG4gICAgICAgIG91dGVyUmluZ3NbeF0ucHVzaChob2xlKTtcbiAgICAgICAgY29udGFpbmVkID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gcmluZyBpcyBub3QgY29udGFpbmVkIGluIGFueSBvdXRlciByaW5nXG4gICAgLy8gc29tZXRpbWVzIHRoaXMgaGFwcGVucyBodHRwczovL2dpdGh1Yi5jb20vRXNyaS9lc3JpLWxlYWZsZXQvaXNzdWVzLzMyMFxuICAgIGlmICghY29udGFpbmVkKSB7XG4gICAgICB1bmNvbnRhaW5lZEhvbGVzLnB1c2goaG9sZSk7XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgd2UgY291bGRuJ3QgbWF0Y2ggYW55IGhvbGVzIHVzaW5nIGNvbnRhaW5zIHdlIGNhbiB0cnkgaW50ZXJzZWN0cy4uLlxuICB3aGlsZSAodW5jb250YWluZWRIb2xlcy5sZW5ndGgpIHtcbiAgICAvLyBwb3AgYSBob2xlIG9mZiBvdXQgc3RhY2tcbiAgICBob2xlID0gdW5jb250YWluZWRIb2xlcy5wb3AoKTtcblxuICAgIC8vIGxvb3Agb3ZlciBhbGwgb3V0ZXIgcmluZ3MgYW5kIHNlZSBpZiBhbnkgaW50ZXJzZWN0IG91ciBob2xlLlxuICAgIHZhciBpbnRlcnNlY3RzID0gZmFsc2U7XG5cbiAgICBmb3IgKHggPSBvdXRlclJpbmdzLmxlbmd0aCAtIDE7IHggPj0gMDsgeC0tKSB7XG4gICAgICBvdXRlclJpbmcgPSBvdXRlclJpbmdzW3hdWzBdO1xuICAgICAgaWYgKGFycmF5SW50ZXJzZWN0c0FycmF5KG91dGVyUmluZywgaG9sZSkpIHtcbiAgICAgICAgLy8gdGhlIGhvbGUgaXMgY29udGFpbmVkIHB1c2ggaXQgaW50byBvdXIgcG9seWdvblxuICAgICAgICBvdXRlclJpbmdzW3hdLnB1c2goaG9sZSk7XG4gICAgICAgIGludGVyc2VjdHMgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIWludGVyc2VjdHMpIHtcbiAgICAgIG91dGVyUmluZ3MucHVzaChbaG9sZS5yZXZlcnNlKCldKTtcbiAgICB9XG4gIH1cblxuICBpZiAob3V0ZXJSaW5ncy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogJ1BvbHlnb24nLFxuICAgICAgY29vcmRpbmF0ZXM6IG91dGVyUmluZ3NbMF1cbiAgICB9O1xuICB9IGVsc2Uge1xuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiAnTXVsdGlQb2x5Z29uJyxcbiAgICAgIGNvb3JkaW5hdGVzOiBvdXRlclJpbmdzXG4gICAgfTtcbiAgfVxufVxuXG4vLyBUaGlzIGZ1bmN0aW9uIGVuc3VyZXMgdGhhdCByaW5ncyBhcmUgb3JpZW50ZWQgaW4gdGhlIHJpZ2h0IGRpcmVjdGlvbnNcbi8vIG91dGVyIHJpbmdzIGFyZSBjbG9ja3dpc2UsIGhvbGVzIGFyZSBjb3VudGVyY2xvY2t3aXNlXG4vLyB1c2VkIGZvciBjb252ZXJ0aW5nIEdlb0pTT04gUG9seWdvbnMgdG8gQXJjR0lTIFBvbHlnb25zXG5mdW5jdGlvbiBvcmllbnRSaW5ncyAocG9seSkge1xuICB2YXIgb3V0cHV0ID0gW107XG4gIHZhciBwb2x5Z29uID0gcG9seS5zbGljZSgwKTtcbiAgdmFyIG91dGVyUmluZyA9IGNsb3NlUmluZyhwb2x5Z29uLnNoaWZ0KCkuc2xpY2UoMCkpO1xuICBpZiAob3V0ZXJSaW5nLmxlbmd0aCA+PSA0KSB7XG4gICAgaWYgKCFyaW5nSXNDbG9ja3dpc2Uob3V0ZXJSaW5nKSkge1xuICAgICAgb3V0ZXJSaW5nLnJldmVyc2UoKTtcbiAgICB9XG5cbiAgICBvdXRwdXQucHVzaChvdXRlclJpbmcpO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwb2x5Z29uLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgaG9sZSA9IGNsb3NlUmluZyhwb2x5Z29uW2ldLnNsaWNlKDApKTtcbiAgICAgIGlmIChob2xlLmxlbmd0aCA+PSA0KSB7XG4gICAgICAgIGlmIChyaW5nSXNDbG9ja3dpc2UoaG9sZSkpIHtcbiAgICAgICAgICBob2xlLnJldmVyc2UoKTtcbiAgICAgICAgfVxuICAgICAgICBvdXRwdXQucHVzaChob2xlKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gb3V0cHV0O1xufVxuXG4vLyBUaGlzIGZ1bmN0aW9uIGZsYXR0ZW5zIGhvbGVzIGluIG11bHRpcG9seWdvbnMgdG8gb25lIGFycmF5IG9mIHBvbHlnb25zXG4vLyB1c2VkIGZvciBjb252ZXJ0aW5nIEdlb0pTT04gUG9seWdvbnMgdG8gQXJjR0lTIFBvbHlnb25zXG5mdW5jdGlvbiBmbGF0dGVuTXVsdGlQb2x5Z29uUmluZ3MgKHJpbmdzKSB7XG4gIHZhciBvdXRwdXQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCByaW5ncy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBwb2x5Z29uID0gb3JpZW50UmluZ3MocmluZ3NbaV0pO1xuICAgIGZvciAodmFyIHggPSBwb2x5Z29uLmxlbmd0aCAtIDE7IHggPj0gMDsgeC0tKSB7XG4gICAgICB2YXIgcmluZyA9IHBvbHlnb25beF0uc2xpY2UoMCk7XG4gICAgICBvdXRwdXQucHVzaChyaW5nKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG91dHB1dDtcbn1cblxuLy8gc2hhbGxvdyBvYmplY3QgY2xvbmUgZm9yIGZlYXR1cmUgcHJvcGVydGllcyBhbmQgYXR0cmlidXRlc1xuLy8gZnJvbSBodHRwOi8vanNwZXJmLmNvbS9jbG9uaW5nLWFuLW9iamVjdC8yXG5mdW5jdGlvbiBzaGFsbG93Q2xvbmUgKG9iaikge1xuICB2YXIgdGFyZ2V0ID0ge307XG4gIGZvciAodmFyIGkgaW4gb2JqKSB7XG4gICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShpKSkge1xuICAgICAgdGFyZ2V0W2ldID0gb2JqW2ldO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGFyZ2V0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXJjZ2lzVG9HZW9KU09OIChhcmNnaXMsIGlkQXR0cmlidXRlKSB7XG4gIHZhciBnZW9qc29uID0ge307XG5cbiAgaWYgKHR5cGVvZiBhcmNnaXMueCA9PT0gJ251bWJlcicgJiYgdHlwZW9mIGFyY2dpcy55ID09PSAnbnVtYmVyJykge1xuICAgIGdlb2pzb24udHlwZSA9ICdQb2ludCc7XG4gICAgZ2VvanNvbi5jb29yZGluYXRlcyA9IFthcmNnaXMueCwgYXJjZ2lzLnldO1xuICB9XG5cbiAgaWYgKGFyY2dpcy5wb2ludHMpIHtcbiAgICBnZW9qc29uLnR5cGUgPSAnTXVsdGlQb2ludCc7XG4gICAgZ2VvanNvbi5jb29yZGluYXRlcyA9IGFyY2dpcy5wb2ludHMuc2xpY2UoMCk7XG4gIH1cblxuICBpZiAoYXJjZ2lzLnBhdGhzKSB7XG4gICAgaWYgKGFyY2dpcy5wYXRocy5sZW5ndGggPT09IDEpIHtcbiAgICAgIGdlb2pzb24udHlwZSA9ICdMaW5lU3RyaW5nJztcbiAgICAgIGdlb2pzb24uY29vcmRpbmF0ZXMgPSBhcmNnaXMucGF0aHNbMF0uc2xpY2UoMCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGdlb2pzb24udHlwZSA9ICdNdWx0aUxpbmVTdHJpbmcnO1xuICAgICAgZ2VvanNvbi5jb29yZGluYXRlcyA9IGFyY2dpcy5wYXRocy5zbGljZSgwKTtcbiAgICB9XG4gIH1cblxuICBpZiAoYXJjZ2lzLnJpbmdzKSB7XG4gICAgZ2VvanNvbiA9IGNvbnZlcnRSaW5nc1RvR2VvSlNPTihhcmNnaXMucmluZ3Muc2xpY2UoMCkpO1xuICB9XG5cbiAgaWYgKGFyY2dpcy5nZW9tZXRyeSB8fCBhcmNnaXMuYXR0cmlidXRlcykge1xuICAgIGdlb2pzb24udHlwZSA9ICdGZWF0dXJlJztcbiAgICBnZW9qc29uLmdlb21ldHJ5ID0gKGFyY2dpcy5nZW9tZXRyeSkgPyBhcmNnaXNUb0dlb0pTT04oYXJjZ2lzLmdlb21ldHJ5KSA6IG51bGw7XG4gICAgZ2VvanNvbi5wcm9wZXJ0aWVzID0gKGFyY2dpcy5hdHRyaWJ1dGVzKSA/IHNoYWxsb3dDbG9uZShhcmNnaXMuYXR0cmlidXRlcykgOiBudWxsO1xuICAgIGlmIChhcmNnaXMuYXR0cmlidXRlcykge1xuICAgICAgZ2VvanNvbi5pZCA9IGFyY2dpcy5hdHRyaWJ1dGVzW2lkQXR0cmlidXRlXSB8fCBhcmNnaXMuYXR0cmlidXRlcy5PQkpFQ1RJRCB8fCBhcmNnaXMuYXR0cmlidXRlcy5GSUQ7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGdlb2pzb247XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW9qc29uVG9BcmNHSVMgKGdlb2pzb24sIGlkQXR0cmlidXRlKSB7XG4gIGlkQXR0cmlidXRlID0gaWRBdHRyaWJ1dGUgfHwgJ09CSkVDVElEJztcbiAgdmFyIHNwYXRpYWxSZWZlcmVuY2UgPSB7IHdraWQ6IDQzMjYgfTtcbiAgdmFyIHJlc3VsdCA9IHt9O1xuICB2YXIgaTtcblxuICBzd2l0Y2ggKGdlb2pzb24udHlwZSkge1xuICAgIGNhc2UgJ1BvaW50JzpcbiAgICAgIHJlc3VsdC54ID0gZ2VvanNvbi5jb29yZGluYXRlc1swXTtcbiAgICAgIHJlc3VsdC55ID0gZ2VvanNvbi5jb29yZGluYXRlc1sxXTtcbiAgICAgIHJlc3VsdC5zcGF0aWFsUmVmZXJlbmNlID0gc3BhdGlhbFJlZmVyZW5jZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ011bHRpUG9pbnQnOlxuICAgICAgcmVzdWx0LnBvaW50cyA9IGdlb2pzb24uY29vcmRpbmF0ZXMuc2xpY2UoMCk7XG4gICAgICByZXN1bHQuc3BhdGlhbFJlZmVyZW5jZSA9IHNwYXRpYWxSZWZlcmVuY2U7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdMaW5lU3RyaW5nJzpcbiAgICAgIHJlc3VsdC5wYXRocyA9IFtnZW9qc29uLmNvb3JkaW5hdGVzLnNsaWNlKDApXTtcbiAgICAgIHJlc3VsdC5zcGF0aWFsUmVmZXJlbmNlID0gc3BhdGlhbFJlZmVyZW5jZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ011bHRpTGluZVN0cmluZyc6XG4gICAgICByZXN1bHQucGF0aHMgPSBnZW9qc29uLmNvb3JkaW5hdGVzLnNsaWNlKDApO1xuICAgICAgcmVzdWx0LnNwYXRpYWxSZWZlcmVuY2UgPSBzcGF0aWFsUmVmZXJlbmNlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXN1bHQucmluZ3MgPSBvcmllbnRSaW5ncyhnZW9qc29uLmNvb3JkaW5hdGVzLnNsaWNlKDApKTtcbiAgICAgIHJlc3VsdC5zcGF0aWFsUmVmZXJlbmNlID0gc3BhdGlhbFJlZmVyZW5jZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ011bHRpUG9seWdvbic6XG4gICAgICByZXN1bHQucmluZ3MgPSBmbGF0dGVuTXVsdGlQb2x5Z29uUmluZ3MoZ2VvanNvbi5jb29yZGluYXRlcy5zbGljZSgwKSk7XG4gICAgICByZXN1bHQuc3BhdGlhbFJlZmVyZW5jZSA9IHNwYXRpYWxSZWZlcmVuY2U7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdGZWF0dXJlJzpcbiAgICAgIGlmIChnZW9qc29uLmdlb21ldHJ5KSB7XG4gICAgICAgIHJlc3VsdC5nZW9tZXRyeSA9IGdlb2pzb25Ub0FyY0dJUyhnZW9qc29uLmdlb21ldHJ5LCBpZEF0dHJpYnV0ZSk7XG4gICAgICB9XG4gICAgICByZXN1bHQuYXR0cmlidXRlcyA9IChnZW9qc29uLnByb3BlcnRpZXMpID8gc2hhbGxvd0Nsb25lKGdlb2pzb24ucHJvcGVydGllcykgOiB7fTtcbiAgICAgIGlmIChnZW9qc29uLmlkKSB7XG4gICAgICAgIHJlc3VsdC5hdHRyaWJ1dGVzW2lkQXR0cmlidXRlXSA9IGdlb2pzb24uaWQ7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdGZWF0dXJlQ29sbGVjdGlvbic6XG4gICAgICByZXN1bHQgPSBbXTtcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBnZW9qc29uLmZlYXR1cmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHJlc3VsdC5wdXNoKGdlb2pzb25Ub0FyY0dJUyhnZW9qc29uLmZlYXR1cmVzW2ldLCBpZEF0dHJpYnV0ZSkpO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnR2VvbWV0cnlDb2xsZWN0aW9uJzpcbiAgICAgIHJlc3VsdCA9IFtdO1xuICAgICAgZm9yIChpID0gMDsgaSA8IGdlb2pzb24uZ2VvbWV0cmllcy5sZW5ndGg7IGkrKykge1xuICAgICAgICByZXN1bHQucHVzaChnZW9qc29uVG9BcmNHSVMoZ2VvanNvbi5nZW9tZXRyaWVzW2ldLCBpZEF0dHJpYnV0ZSkpO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gIH1cblxuICByZXR1cm4gcmVzdWx0O1xufVxuIiwiaW1wb3J0IEwgZnJvbSAnbGVhZmxldCc7XG5cbmV4cG9ydCB2YXIgU3ltYm9sID0gTC5DbGFzcy5leHRlbmQoe1xuICBpbml0aWFsaXplOiBmdW5jdGlvbiAoc3ltYm9sSnNvbiwgb3B0aW9ucykge1xuICAgIHRoaXMuX3N5bWJvbEpzb24gPSBzeW1ib2xKc29uO1xuICAgIHRoaXMudmFsID0gbnVsbDtcbiAgICB0aGlzLl9zdHlsZXMgPSB7fTtcbiAgICB0aGlzLl9pc0RlZmF1bHQgPSBmYWxzZTtcbiAgICB0aGlzLl9sYXllclRyYW5zcGFyZW5jeSA9IDE7XG4gICAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5sYXllclRyYW5zcGFyZW5jeSkge1xuICAgICAgdGhpcy5fbGF5ZXJUcmFuc3BhcmVuY3kgPSAxIC0gKG9wdGlvbnMubGF5ZXJUcmFuc3BhcmVuY3kgLyAxMDAuMCk7XG4gICAgfVxuICB9LFxuXG4gIC8vIHRoZSBnZW9qc29uIHZhbHVlcyByZXR1cm5lZCBhcmUgaW4gcG9pbnRzXG4gIHBpeGVsVmFsdWU6IGZ1bmN0aW9uIChwb2ludFZhbHVlKSB7XG4gICAgcmV0dXJuIHBvaW50VmFsdWUgKiAxLjMzMztcbiAgfSxcblxuICAvLyBjb2xvciBpcyBhbiBhcnJheSBbcixnLGIsYV1cbiAgY29sb3JWYWx1ZTogZnVuY3Rpb24gKGNvbG9yKSB7XG4gICAgcmV0dXJuICdyZ2IoJyArIGNvbG9yWzBdICsgJywnICsgY29sb3JbMV0gKyAnLCcgKyBjb2xvclsyXSArICcpJztcbiAgfSxcblxuICBhbHBoYVZhbHVlOiBmdW5jdGlvbiAoY29sb3IpIHtcbiAgICB2YXIgYWxwaGEgPSBjb2xvclszXSAvIDI1NS4wO1xuICAgIHJldHVybiBhbHBoYSAqIHRoaXMuX2xheWVyVHJhbnNwYXJlbmN5O1xuICB9LFxuXG4gIGdldFNpemU6IGZ1bmN0aW9uIChmZWF0dXJlLCBzaXplSW5mbykge1xuICAgIHZhciBhdHRyID0gZmVhdHVyZS5wcm9wZXJ0aWVzO1xuICAgIHZhciBmaWVsZCA9IHNpemVJbmZvLmZpZWxkO1xuICAgIHZhciBzaXplID0gMDtcbiAgICB2YXIgZmVhdHVyZVZhbHVlID0gbnVsbDtcblxuICAgIGlmIChmaWVsZCkge1xuICAgICAgZmVhdHVyZVZhbHVlID0gYXR0cltmaWVsZF07XG4gICAgICB2YXIgbWluU2l6ZSA9IHNpemVJbmZvLm1pblNpemU7XG4gICAgICB2YXIgbWF4U2l6ZSA9IHNpemVJbmZvLm1heFNpemU7XG4gICAgICB2YXIgbWluRGF0YVZhbHVlID0gc2l6ZUluZm8ubWluRGF0YVZhbHVlO1xuICAgICAgdmFyIG1heERhdGFWYWx1ZSA9IHNpemVJbmZvLm1heERhdGFWYWx1ZTtcbiAgICAgIHZhciBmZWF0dXJlUmF0aW87XG4gICAgICB2YXIgbm9ybUZpZWxkID0gc2l6ZUluZm8ubm9ybWFsaXphdGlvbkZpZWxkO1xuICAgICAgdmFyIG5vcm1WYWx1ZSA9IGF0dHIgPyBwYXJzZUZsb2F0KGF0dHJbbm9ybUZpZWxkXSkgOiB1bmRlZmluZWQ7XG5cbiAgICAgIGlmIChmZWF0dXJlVmFsdWUgPT09IG51bGwgfHwgKG5vcm1GaWVsZCAmJiAoKGlzTmFOKG5vcm1WYWx1ZSkgfHwgbm9ybVZhbHVlID09PSAwKSkpKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuXG4gICAgICBpZiAoIWlzTmFOKG5vcm1WYWx1ZSkpIHtcbiAgICAgICAgZmVhdHVyZVZhbHVlIC89IG5vcm1WYWx1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1pblNpemUgIT09IG51bGwgJiYgbWF4U2l6ZSAhPT0gbnVsbCAmJiBtaW5EYXRhVmFsdWUgIT09IG51bGwgJiYgbWF4RGF0YVZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgIGlmIChmZWF0dXJlVmFsdWUgPD0gbWluRGF0YVZhbHVlKSB7XG4gICAgICAgICAgc2l6ZSA9IG1pblNpemU7XG4gICAgICAgIH0gZWxzZSBpZiAoZmVhdHVyZVZhbHVlID49IG1heERhdGFWYWx1ZSkge1xuICAgICAgICAgIHNpemUgPSBtYXhTaXplO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGZlYXR1cmVSYXRpbyA9IChmZWF0dXJlVmFsdWUgLSBtaW5EYXRhVmFsdWUpIC8gKG1heERhdGFWYWx1ZSAtIG1pbkRhdGFWYWx1ZSk7XG4gICAgICAgICAgc2l6ZSA9IG1pblNpemUgKyAoZmVhdHVyZVJhdGlvICogKG1heFNpemUgLSBtaW5TaXplKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHNpemUgPSBpc05hTihzaXplKSA/IDAgOiBzaXplO1xuICAgIH1cbiAgICByZXR1cm4gc2l6ZTtcbiAgfSxcblxuICBnZXRDb2xvcjogZnVuY3Rpb24gKGZlYXR1cmUsIGNvbG9ySW5mbykge1xuICAgIC8vIHJlcXVpcmVkIGluZm9ybWF0aW9uIHRvIGdldCBjb2xvclxuICAgIGlmICghKGZlYXR1cmUucHJvcGVydGllcyAmJiBjb2xvckluZm8gJiYgY29sb3JJbmZvLmZpZWxkICYmIGNvbG9ySW5mby5zdG9wcykpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHZhciBhdHRyID0gZmVhdHVyZS5wcm9wZXJ0aWVzO1xuICAgIHZhciBmZWF0dXJlVmFsdWUgPSBhdHRyW2NvbG9ySW5mby5maWVsZF07XG4gICAgdmFyIGxvd2VyQm91bmRDb2xvciwgdXBwZXJCb3VuZENvbG9yLCBsb3dlckJvdW5kLCB1cHBlckJvdW5kO1xuICAgIHZhciBub3JtRmllbGQgPSBjb2xvckluZm8ubm9ybWFsaXphdGlvbkZpZWxkO1xuICAgIHZhciBub3JtVmFsdWUgPSBhdHRyID8gcGFyc2VGbG9hdChhdHRyW25vcm1GaWVsZF0pIDogdW5kZWZpbmVkO1xuICAgIGlmIChmZWF0dXJlVmFsdWUgPT09IG51bGwgfHwgKG5vcm1GaWVsZCAmJiAoKGlzTmFOKG5vcm1WYWx1ZSkgfHwgbm9ybVZhbHVlID09PSAwKSkpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoIWlzTmFOKG5vcm1WYWx1ZSkpIHtcbiAgICAgIGZlYXR1cmVWYWx1ZSAvPSBub3JtVmFsdWU7XG4gICAgfVxuXG4gICAgaWYgKGZlYXR1cmVWYWx1ZSA8PSBjb2xvckluZm8uc3RvcHNbMF0udmFsdWUpIHtcbiAgICAgIHJldHVybiBjb2xvckluZm8uc3RvcHNbMF0uY29sb3I7XG4gICAgfVxuICAgIHZhciBsYXN0U3RvcCA9IGNvbG9ySW5mby5zdG9wc1tjb2xvckluZm8uc3RvcHMubGVuZ3RoIC0gMV07XG4gICAgaWYgKGZlYXR1cmVWYWx1ZSA+PSBsYXN0U3RvcC52YWx1ZSkge1xuICAgICAgcmV0dXJuIGxhc3RTdG9wLmNvbG9yO1xuICAgIH1cblxuICAgIC8vIGdvIHRocm91Z2ggdGhlIHN0b3BzIHRvIGZpbmQgbWluIGFuZCBtYXhcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvbG9ySW5mby5zdG9wcy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHN0b3BJbmZvID0gY29sb3JJbmZvLnN0b3BzW2ldO1xuXG4gICAgICBpZiAoc3RvcEluZm8udmFsdWUgPD0gZmVhdHVyZVZhbHVlKSB7XG4gICAgICAgIGxvd2VyQm91bmRDb2xvciA9IHN0b3BJbmZvLmNvbG9yO1xuICAgICAgICBsb3dlckJvdW5kID0gc3RvcEluZm8udmFsdWU7XG4gICAgICB9IGVsc2UgaWYgKHN0b3BJbmZvLnZhbHVlID4gZmVhdHVyZVZhbHVlKSB7XG4gICAgICAgIHVwcGVyQm91bmRDb2xvciA9IHN0b3BJbmZvLmNvbG9yO1xuICAgICAgICB1cHBlckJvdW5kID0gc3RvcEluZm8udmFsdWU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGZlYXR1cmUgZmFsbHMgYmV0d2VlbiB0d28gc3RvcHMsIGludGVycGxhdGUgdGhlIGNvbG9yc1xuICAgIGlmICghaXNOYU4obG93ZXJCb3VuZCkgJiYgIWlzTmFOKHVwcGVyQm91bmQpKSB7XG4gICAgICB2YXIgcmFuZ2UgPSB1cHBlckJvdW5kIC0gbG93ZXJCb3VuZDtcbiAgICAgIGlmIChyYW5nZSA+IDApIHtcbiAgICAgICAgLy8gbW9yZSB3ZWlnaHQgdGhlIGZ1cnRoZXIgaXQgaXMgZnJvbSB0aGUgbG93ZXIgYm91bmRcbiAgICAgICAgdmFyIHVwcGVyQm91bmRDb2xvcldlaWdodCA9IChmZWF0dXJlVmFsdWUgLSBsb3dlckJvdW5kKSAvIHJhbmdlO1xuICAgICAgICBpZiAodXBwZXJCb3VuZENvbG9yV2VpZ2h0KSB7XG4gICAgICAgICAgLy8gbW9yZSB3ZWlnaHQgdGhlIGZ1cnRoZXIgaXQgaXMgZnJvbSB0aGUgdXBwZXIgYm91bmRcbiAgICAgICAgICB2YXIgbG93ZXJCb3VuZENvbG9yV2VpZ2h0ID0gKHVwcGVyQm91bmQgLSBmZWF0dXJlVmFsdWUpIC8gcmFuZ2U7XG4gICAgICAgICAgaWYgKGxvd2VyQm91bmRDb2xvcldlaWdodCkge1xuICAgICAgICAgICAgLy8gaW50ZXJwb2xhdGUgdGhlIGxvd2VyIGFuZCB1cHBlciBib3VuZCBjb2xvciBieSBhcHBseWluZyB0aGVcbiAgICAgICAgICAgIC8vIHdlaWdodHMgdG8gZWFjaCBvZiB0aGUgcmdiYSBjb2xvcnMgYW5kIGFkZGluZyB0aGVtIHRvZ2V0aGVyXG4gICAgICAgICAgICB2YXIgaW50ZXJwb2xhdGVkQ29sb3IgPSBbXTtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgNDsgaisrKSB7XG4gICAgICAgICAgICAgIGludGVycG9sYXRlZENvbG9yW2pdID0gTWF0aC5yb3VuZChsb3dlckJvdW5kQ29sb3Jbal0gKiBsb3dlckJvdW5kQ29sb3JXZWlnaHQgKyB1cHBlckJvdW5kQ29sb3Jbal0gKiB1cHBlckJvdW5kQ29sb3JXZWlnaHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGludGVycG9sYXRlZENvbG9yO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBubyBkaWZmZXJlbmNlIGJldHdlZW4gZmVhdHVyZVZhbHVlIGFuZCB1cHBlckJvdW5kLCAxMDAlIG9mIHVwcGVyQm91bmRDb2xvclxuICAgICAgICAgICAgcmV0dXJuIHVwcGVyQm91bmRDb2xvcjtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gbm8gZGlmZmVyZW5jZSBiZXR3ZWVuIGZlYXR1cmVWYWx1ZSBhbmQgbG93ZXJCb3VuZCwgMTAwJSBvZiBsb3dlckJvdW5kQ29sb3JcbiAgICAgICAgICByZXR1cm4gbG93ZXJCb3VuZENvbG9yO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vIGlmIHdlIGdldCB0byBoZXJlLCBub25lIG9mIHRoZSBjYXNlcyBhcHBseSBzbyByZXR1cm4gbnVsbFxuICAgIHJldHVybiBudWxsO1xuICB9XG59KTtcblxuLy8gZXhwb3J0IGZ1bmN0aW9uIHN5bWJvbCAoc3ltYm9sSnNvbikge1xuLy8gICByZXR1cm4gbmV3IFN5bWJvbChzeW1ib2xKc29uKTtcbi8vIH1cblxuZXhwb3J0IGRlZmF1bHQgU3ltYm9sO1xuIiwiaW1wb3J0IEwgZnJvbSAnbGVhZmxldCc7XG5cbmV4cG9ydCB2YXIgU2hhcGVNYXJrZXIgPSBMLlBhdGguZXh0ZW5kKHtcblxuICBpbml0aWFsaXplOiBmdW5jdGlvbiAobGF0bG5nLCBzaXplLCBvcHRpb25zKSB7XG4gICAgTC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xuICAgIHRoaXMuX3NpemUgPSBzaXplO1xuICAgIHRoaXMuX2xhdGxuZyA9IEwubGF0TG5nKGxhdGxuZyk7XG4gICAgdGhpcy5fc3ZnQ2FudmFzSW5jbHVkZXMoKTtcbiAgfSxcblxuICB0b0dlb0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gTC5HZW9KU09OLmdldEZlYXR1cmUodGhpcywge1xuICAgICAgdHlwZTogJ1BvaW50JyxcbiAgICAgIGNvb3JkaW5hdGVzOiBMLkdlb0pTT04ubGF0TG5nVG9Db29yZHModGhpcy5nZXRMYXRMbmcoKSlcbiAgICB9KTtcbiAgfSxcblxuICBfc3ZnQ2FudmFzSW5jbHVkZXM6IGZ1bmN0aW9uICgpIHtcbiAgICAvLyBpbXBsZW1lbnQgaW4gc3ViIGNsYXNzXG4gIH0sXG5cbiAgX3Byb2plY3Q6IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLl9wb2ludCA9IHRoaXMuX21hcC5sYXRMbmdUb0xheWVyUG9pbnQodGhpcy5fbGF0bG5nKTtcbiAgfSxcblxuICBfdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMuX21hcCkge1xuICAgICAgdGhpcy5fdXBkYXRlUGF0aCgpO1xuICAgIH1cbiAgfSxcblxuICBfdXBkYXRlUGF0aDogZnVuY3Rpb24gKCkge1xuICAgIC8vIGltcGxlbWVudCBpbiBzdWIgY2xhc3NcbiAgfSxcblxuICBzZXRMYXRMbmc6IGZ1bmN0aW9uIChsYXRsbmcpIHtcbiAgICB0aGlzLl9sYXRsbmcgPSBMLmxhdExuZyhsYXRsbmcpO1xuICAgIHRoaXMucmVkcmF3KCk7XG4gICAgcmV0dXJuIHRoaXMuZmlyZSgnbW92ZScsIHtsYXRsbmc6IHRoaXMuX2xhdGxuZ30pO1xuICB9LFxuXG4gIGdldExhdExuZzogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLl9sYXRsbmc7XG4gIH0sXG5cbiAgc2V0U2l6ZTogZnVuY3Rpb24gKHNpemUpIHtcbiAgICB0aGlzLl9zaXplID0gc2l6ZTtcbiAgICByZXR1cm4gdGhpcy5yZWRyYXcoKTtcbiAgfSxcblxuICBnZXRTaXplOiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuX3NpemU7XG4gIH1cbn0pO1xuIiwiaW1wb3J0IEwgZnJvbSAnbGVhZmxldCc7XG5pbXBvcnQgeyBTaGFwZU1hcmtlciB9IGZyb20gJy4vU2hhcGVNYXJrZXInO1xuXG5leHBvcnQgdmFyIENyb3NzTWFya2VyID0gU2hhcGVNYXJrZXIuZXh0ZW5kKHtcblxuICBpbml0aWFsaXplOiBmdW5jdGlvbiAobGF0bG5nLCBzaXplLCBvcHRpb25zKSB7XG4gICAgU2hhcGVNYXJrZXIucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLCBsYXRsbmcsIHNpemUsIG9wdGlvbnMpO1xuICB9LFxuXG4gIF91cGRhdGVQYXRoOiBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5fcmVuZGVyZXIuX3VwZGF0ZUNyb3NzTWFya2VyKHRoaXMpO1xuICB9LFxuXG4gIF9zdmdDYW52YXNJbmNsdWRlczogZnVuY3Rpb24gKCkge1xuICAgIEwuQ2FudmFzLmluY2x1ZGUoe1xuICAgICAgX3VwZGF0ZUNyb3NzTWFya2VyOiBmdW5jdGlvbiAobGF5ZXIpIHtcbiAgICAgICAgdmFyIGxhdGxuZyA9IGxheWVyLl9wb2ludDtcbiAgICAgICAgdmFyIG9mZnNldCA9IGxheWVyLl9zaXplIC8gMi4wO1xuICAgICAgICB2YXIgY3R4ID0gdGhpcy5fY3R4O1xuXG4gICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgY3R4Lm1vdmVUbyhsYXRsbmcueCwgbGF0bG5nLnkgKyBvZmZzZXQpO1xuICAgICAgICBjdHgubGluZVRvKGxhdGxuZy54LCBsYXRsbmcueSAtIG9mZnNldCk7XG4gICAgICAgIHRoaXMuX2ZpbGxTdHJva2UoY3R4LCBsYXllcik7XG5cbiAgICAgICAgY3R4Lm1vdmVUbyhsYXRsbmcueCAtIG9mZnNldCwgbGF0bG5nLnkpO1xuICAgICAgICBjdHgubGluZVRvKGxhdGxuZy54ICsgb2Zmc2V0LCBsYXRsbmcueSk7XG4gICAgICAgIHRoaXMuX2ZpbGxTdHJva2UoY3R4LCBsYXllcik7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBMLlNWRy5pbmNsdWRlKHtcbiAgICAgIF91cGRhdGVDcm9zc01hcmtlcjogZnVuY3Rpb24gKGxheWVyKSB7XG4gICAgICAgIHZhciBsYXRsbmcgPSBsYXllci5fcG9pbnQ7XG4gICAgICAgIHZhciBvZmZzZXQgPSBsYXllci5fc2l6ZSAvIDIuMDtcblxuICAgICAgICBpZiAoTC5Ccm93c2VyLnZtbCkge1xuICAgICAgICAgIGxhdGxuZy5fcm91bmQoKTtcbiAgICAgICAgICBvZmZzZXQgPSBNYXRoLnJvdW5kKG9mZnNldCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc3RyID0gJ00nICsgbGF0bG5nLnggKyAnLCcgKyAobGF0bG5nLnkgKyBvZmZzZXQpICtcbiAgICAgICAgICAnTCcgKyBsYXRsbmcueCArICcsJyArIChsYXRsbmcueSAtIG9mZnNldCkgK1xuICAgICAgICAgICdNJyArIChsYXRsbmcueCAtIG9mZnNldCkgKyAnLCcgKyBsYXRsbmcueSArXG4gICAgICAgICAgJ0wnICsgKGxhdGxuZy54ICsgb2Zmc2V0KSArICcsJyArIGxhdGxuZy55O1xuXG4gICAgICAgIHRoaXMuX3NldFBhdGgobGF5ZXIsIHN0cik7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn0pO1xuXG5leHBvcnQgdmFyIGNyb3NzTWFya2VyID0gZnVuY3Rpb24gKGxhdGxuZywgc2l6ZSwgb3B0aW9ucykge1xuICByZXR1cm4gbmV3IENyb3NzTWFya2VyKGxhdGxuZywgc2l6ZSwgb3B0aW9ucyk7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBjcm9zc01hcmtlcjtcbiIsImltcG9ydCBMIGZyb20gJ2xlYWZsZXQnO1xuaW1wb3J0IHsgU2hhcGVNYXJrZXIgfSBmcm9tICcuL1NoYXBlTWFya2VyJztcblxuZXhwb3J0IHZhciBYTWFya2VyID0gU2hhcGVNYXJrZXIuZXh0ZW5kKHtcblxuICBpbml0aWFsaXplOiBmdW5jdGlvbiAobGF0bG5nLCBzaXplLCBvcHRpb25zKSB7XG4gICAgU2hhcGVNYXJrZXIucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLCBsYXRsbmcsIHNpemUsIG9wdGlvbnMpO1xuICB9LFxuXG4gIF91cGRhdGVQYXRoOiBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5fcmVuZGVyZXIuX3VwZGF0ZVhNYXJrZXIodGhpcyk7XG4gIH0sXG5cbiAgX3N2Z0NhbnZhc0luY2x1ZGVzOiBmdW5jdGlvbiAoKSB7XG4gICAgTC5DYW52YXMuaW5jbHVkZSh7XG4gICAgICBfdXBkYXRlWE1hcmtlcjogZnVuY3Rpb24gKGxheWVyKSB7XG4gICAgICAgIHZhciBsYXRsbmcgPSBsYXllci5fcG9pbnQ7XG4gICAgICAgIHZhciBvZmZzZXQgPSBsYXllci5fc2l6ZSAvIDIuMDtcbiAgICAgICAgdmFyIGN0eCA9IHRoaXMuX2N0eDtcblxuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG5cbiAgICAgICAgY3R4Lm1vdmVUbyhsYXRsbmcueCArIG9mZnNldCwgbGF0bG5nLnkgKyBvZmZzZXQpO1xuICAgICAgICBjdHgubGluZVRvKGxhdGxuZy54IC0gb2Zmc2V0LCBsYXRsbmcueSAtIG9mZnNldCk7XG4gICAgICAgIHRoaXMuX2ZpbGxTdHJva2UoY3R4LCBsYXllcik7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBMLlNWRy5pbmNsdWRlKHtcbiAgICAgIF91cGRhdGVYTWFya2VyOiBmdW5jdGlvbiAobGF5ZXIpIHtcbiAgICAgICAgdmFyIGxhdGxuZyA9IGxheWVyLl9wb2ludDtcbiAgICAgICAgdmFyIG9mZnNldCA9IGxheWVyLl9zaXplIC8gMi4wO1xuXG4gICAgICAgIGlmIChMLkJyb3dzZXIudm1sKSB7XG4gICAgICAgICAgbGF0bG5nLl9yb3VuZCgpO1xuICAgICAgICAgIG9mZnNldCA9IE1hdGgucm91bmQob2Zmc2V0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzdHIgPSAnTScgKyAobGF0bG5nLnggKyBvZmZzZXQpICsgJywnICsgKGxhdGxuZy55ICsgb2Zmc2V0KSArXG4gICAgICAgICAgJ0wnICsgKGxhdGxuZy54IC0gb2Zmc2V0KSArICcsJyArIChsYXRsbmcueSAtIG9mZnNldCkgK1xuICAgICAgICAgICdNJyArIChsYXRsbmcueCAtIG9mZnNldCkgKyAnLCcgKyAobGF0bG5nLnkgKyBvZmZzZXQpICtcbiAgICAgICAgICAnTCcgKyAobGF0bG5nLnggKyBvZmZzZXQpICsgJywnICsgKGxhdGxuZy55IC0gb2Zmc2V0KTtcblxuICAgICAgICB0aGlzLl9zZXRQYXRoKGxheWVyLCBzdHIpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59KTtcblxuZXhwb3J0IHZhciB4TWFya2VyID0gZnVuY3Rpb24gKGxhdGxuZywgc2l6ZSwgb3B0aW9ucykge1xuICByZXR1cm4gbmV3IFhNYXJrZXIobGF0bG5nLCBzaXplLCBvcHRpb25zKTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IHhNYXJrZXI7XG4iLCJpbXBvcnQgTCBmcm9tICdsZWFmbGV0JztcbmltcG9ydCB7IFNoYXBlTWFya2VyIH0gZnJvbSAnLi9TaGFwZU1hcmtlcic7XG5cbmV4cG9ydCB2YXIgU3F1YXJlTWFya2VyID0gU2hhcGVNYXJrZXIuZXh0ZW5kKHtcbiAgb3B0aW9uczoge1xuICAgIGZpbGw6IHRydWVcbiAgfSxcblxuICBpbml0aWFsaXplOiBmdW5jdGlvbiAobGF0bG5nLCBzaXplLCBvcHRpb25zKSB7XG4gICAgU2hhcGVNYXJrZXIucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLCBsYXRsbmcsIHNpemUsIG9wdGlvbnMpO1xuICB9LFxuXG4gIF91cGRhdGVQYXRoOiBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5fcmVuZGVyZXIuX3VwZGF0ZVNxdWFyZU1hcmtlcih0aGlzKTtcbiAgfSxcblxuICBfc3ZnQ2FudmFzSW5jbHVkZXM6IGZ1bmN0aW9uICgpIHtcbiAgICBMLkNhbnZhcy5pbmNsdWRlKHtcbiAgICAgIF91cGRhdGVTcXVhcmVNYXJrZXI6IGZ1bmN0aW9uIChsYXllcikge1xuICAgICAgICB2YXIgbGF0bG5nID0gbGF5ZXIuX3BvaW50O1xuICAgICAgICB2YXIgb2Zmc2V0ID0gbGF5ZXIuX3NpemUgLyAyLjA7XG4gICAgICAgIHZhciBjdHggPSB0aGlzLl9jdHg7XG5cbiAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuXG4gICAgICAgIGN0eC5tb3ZlVG8obGF0bG5nLnggKyBvZmZzZXQsIGxhdGxuZy55ICsgb2Zmc2V0KTtcbiAgICAgICAgY3R4LmxpbmVUbyhsYXRsbmcueCAtIG9mZnNldCwgbGF0bG5nLnkgKyBvZmZzZXQpO1xuICAgICAgICBjdHgubGluZVRvKGxhdGxuZy54IC0gb2Zmc2V0LCBsYXRsbmcueSAtIG9mZnNldCk7XG4gICAgICAgIGN0eC5saW5lVG8obGF0bG5nLnggKyBvZmZzZXQsIGxhdGxuZy55IC0gb2Zmc2V0KTtcblxuICAgICAgICBjdHguY2xvc2VQYXRoKCk7XG5cbiAgICAgICAgdGhpcy5fZmlsbFN0cm9rZShjdHgsIGxheWVyKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIEwuU1ZHLmluY2x1ZGUoe1xuICAgICAgX3VwZGF0ZVNxdWFyZU1hcmtlcjogZnVuY3Rpb24gKGxheWVyKSB7XG4gICAgICAgIHZhciBsYXRsbmcgPSBsYXllci5fcG9pbnQ7XG4gICAgICAgIHZhciBvZmZzZXQgPSBsYXllci5fc2l6ZSAvIDIuMDtcblxuICAgICAgICBpZiAoTC5Ccm93c2VyLnZtbCkge1xuICAgICAgICAgIGxhdGxuZy5fcm91bmQoKTtcbiAgICAgICAgICBvZmZzZXQgPSBNYXRoLnJvdW5kKG9mZnNldCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc3RyID0gJ00nICsgKGxhdGxuZy54ICsgb2Zmc2V0KSArICcsJyArIChsYXRsbmcueSArIG9mZnNldCkgK1xuICAgICAgICAgICdMJyArIChsYXRsbmcueCAtIG9mZnNldCkgKyAnLCcgKyAobGF0bG5nLnkgKyBvZmZzZXQpICtcbiAgICAgICAgICAnTCcgKyAobGF0bG5nLnggLSBvZmZzZXQpICsgJywnICsgKGxhdGxuZy55IC0gb2Zmc2V0KSArXG4gICAgICAgICAgJ0wnICsgKGxhdGxuZy54ICsgb2Zmc2V0KSArICcsJyArIChsYXRsbmcueSAtIG9mZnNldCk7XG5cbiAgICAgICAgc3RyID0gc3RyICsgKEwuQnJvd3Nlci5zdmcgPyAneicgOiAneCcpO1xuXG4gICAgICAgIHRoaXMuX3NldFBhdGgobGF5ZXIsIHN0cik7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn0pO1xuXG5leHBvcnQgdmFyIHNxdWFyZU1hcmtlciA9IGZ1bmN0aW9uIChsYXRsbmcsIHNpemUsIG9wdGlvbnMpIHtcbiAgcmV0dXJuIG5ldyBTcXVhcmVNYXJrZXIobGF0bG5nLCBzaXplLCBvcHRpb25zKTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IHNxdWFyZU1hcmtlcjtcbiIsImltcG9ydCBMIGZyb20gJ2xlYWZsZXQnO1xuaW1wb3J0IHsgU2hhcGVNYXJrZXIgfSBmcm9tICcuL1NoYXBlTWFya2VyJztcblxuZXhwb3J0IHZhciBEaWFtb25kTWFya2VyID0gU2hhcGVNYXJrZXIuZXh0ZW5kKHtcbiAgb3B0aW9uczoge1xuICAgIGZpbGw6IHRydWVcbiAgfSxcblxuICBpbml0aWFsaXplOiBmdW5jdGlvbiAobGF0bG5nLCBzaXplLCBvcHRpb25zKSB7XG4gICAgU2hhcGVNYXJrZXIucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLCBsYXRsbmcsIHNpemUsIG9wdGlvbnMpO1xuICB9LFxuXG4gIF91cGRhdGVQYXRoOiBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5fcmVuZGVyZXIuX3VwZGF0ZURpYW1vbmRNYXJrZXIodGhpcyk7XG4gIH0sXG5cbiAgX3N2Z0NhbnZhc0luY2x1ZGVzOiBmdW5jdGlvbiAoKSB7XG4gICAgTC5DYW52YXMuaW5jbHVkZSh7XG4gICAgICBfdXBkYXRlRGlhbW9uZE1hcmtlcjogZnVuY3Rpb24gKGxheWVyKSB7XG4gICAgICAgIHZhciBsYXRsbmcgPSBsYXllci5fcG9pbnQ7XG4gICAgICAgIHZhciBvZmZzZXQgPSBsYXllci5fc2l6ZSAvIDIuMDtcbiAgICAgICAgdmFyIGN0eCA9IHRoaXMuX2N0eDtcblxuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG5cbiAgICAgICAgY3R4Lm1vdmVUbyhsYXRsbmcueCwgbGF0bG5nLnkgKyBvZmZzZXQpO1xuICAgICAgICBjdHgubGluZVRvKGxhdGxuZy54IC0gb2Zmc2V0LCBsYXRsbmcueSk7XG4gICAgICAgIGN0eC5saW5lVG8obGF0bG5nLngsIGxhdGxuZy55IC0gb2Zmc2V0KTtcbiAgICAgICAgY3R4LmxpbmVUbyhsYXRsbmcueCArIG9mZnNldCwgbGF0bG5nLnkpO1xuXG4gICAgICAgIGN0eC5jbG9zZVBhdGgoKTtcblxuICAgICAgICB0aGlzLl9maWxsU3Ryb2tlKGN0eCwgbGF5ZXIpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgTC5TVkcuaW5jbHVkZSh7XG4gICAgICBfdXBkYXRlRGlhbW9uZE1hcmtlcjogZnVuY3Rpb24gKGxheWVyKSB7XG4gICAgICAgIHZhciBsYXRsbmcgPSBsYXllci5fcG9pbnQ7XG4gICAgICAgIHZhciBvZmZzZXQgPSBsYXllci5fc2l6ZSAvIDIuMDtcblxuICAgICAgICBpZiAoTC5Ccm93c2VyLnZtbCkge1xuICAgICAgICAgIGxhdGxuZy5fcm91bmQoKTtcbiAgICAgICAgICBvZmZzZXQgPSBNYXRoLnJvdW5kKG9mZnNldCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc3RyID0gJ00nICsgbGF0bG5nLnggKyAnLCcgKyAobGF0bG5nLnkgKyBvZmZzZXQpICtcbiAgICAgICAgICAnTCcgKyAobGF0bG5nLnggLSBvZmZzZXQpICsgJywnICsgbGF0bG5nLnkgK1xuICAgICAgICAgICdMJyArIGxhdGxuZy54ICsgJywnICsgKGxhdGxuZy55IC0gb2Zmc2V0KSArXG4gICAgICAgICAgJ0wnICsgKGxhdGxuZy54ICsgb2Zmc2V0KSArICcsJyArIGxhdGxuZy55O1xuXG4gICAgICAgIHN0ciA9IHN0ciArIChMLkJyb3dzZXIuc3ZnID8gJ3onIDogJ3gnKTtcblxuICAgICAgICB0aGlzLl9zZXRQYXRoKGxheWVyLCBzdHIpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59KTtcblxuZXhwb3J0IHZhciBkaWFtb25kTWFya2VyID0gZnVuY3Rpb24gKGxhdGxuZywgc2l6ZSwgb3B0aW9ucykge1xuICByZXR1cm4gbmV3IERpYW1vbmRNYXJrZXIobGF0bG5nLCBzaXplLCBvcHRpb25zKTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IGRpYW1vbmRNYXJrZXI7XG4iLCJpbXBvcnQgTCBmcm9tICdsZWFmbGV0JztcbmltcG9ydCBTeW1ib2wgZnJvbSAnLi9TeW1ib2wnO1xuaW1wb3J0IHtzcXVhcmVNYXJrZXIsIHhNYXJrZXIsIGNyb3NzTWFya2VyLCBkaWFtb25kTWFya2VyfSBmcm9tICdsZWFmbGV0LXNoYXBlLW1hcmtlcnMnO1xuXG5leHBvcnQgdmFyIFBvaW50U3ltYm9sID0gU3ltYm9sLmV4dGVuZCh7XG5cbiAgc3RhdGljczoge1xuICAgIE1BUktFUlRZUEVTOiBbJ2VzcmlTTVNDaXJjbGUnLCAnZXNyaVNNU0Nyb3NzJywgJ2VzcmlTTVNEaWFtb25kJywgJ2VzcmlTTVNTcXVhcmUnLCAnZXNyaVNNU1gnLCAnZXNyaVBNUyddXG4gIH0sXG5cbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKHN5bWJvbEpzb24sIG9wdGlvbnMpIHtcbiAgICB2YXIgdXJsO1xuICAgIFN5bWJvbC5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsIHN5bWJvbEpzb24sIG9wdGlvbnMpO1xuICAgIGlmIChvcHRpb25zKSB7XG4gICAgICB0aGlzLnNlcnZpY2VVcmwgPSBvcHRpb25zLnVybDtcbiAgICB9XG4gICAgaWYgKHN5bWJvbEpzb24pIHtcbiAgICAgIGlmIChzeW1ib2xKc29uLnR5cGUgPT09ICdlc3JpUE1TJykge1xuICAgICAgICB2YXIgaW1hZ2VVcmwgPSB0aGlzLl9zeW1ib2xKc29uLnVybDtcbiAgICAgICAgaWYgKGltYWdlVXJsICYmIGltYWdlVXJsLnN1YnN0cigwLCA3KSA9PT0gJ2h0dHA6Ly8nIHx8IGltYWdlVXJsLnN1YnN0cigwLCA4KSA9PT0gJ2h0dHBzOi8vJykge1xuICAgICAgICAgIC8vIHdlYiBpbWFnZVxuICAgICAgICAgIHVybCA9IHRoaXMuc2FuaXRpemUoaW1hZ2VVcmwpO1xuICAgICAgICAgIHRoaXMuX2ljb25VcmwgPSB1cmw7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdXJsID0gdGhpcy5zZXJ2aWNlVXJsICsgJ2ltYWdlcy8nICsgaW1hZ2VVcmw7XG4gICAgICAgICAgdGhpcy5faWNvblVybCA9IG9wdGlvbnMgJiYgb3B0aW9ucy50b2tlbiA/IHVybCArICc/dG9rZW49JyArIG9wdGlvbnMudG9rZW4gOiB1cmw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHN5bWJvbEpzb24uaW1hZ2VEYXRhKSB7XG4gICAgICAgICAgdGhpcy5faWNvblVybCA9ICdkYXRhOicgKyBzeW1ib2xKc29uLmNvbnRlbnRUeXBlICsgJztiYXNlNjQsJyArIHN5bWJvbEpzb24uaW1hZ2VEYXRhO1xuICAgICAgICB9XG4gICAgICAgIC8vIGxlYWZsZXQgZG9lcyBub3QgYWxsb3cgcmVzaXppbmcgaWNvbnMgc28ga2VlcCBhIGhhc2ggb2YgZGlmZmVyZW50XG4gICAgICAgIC8vIGljb24gc2l6ZXMgdG8gdHJ5IGFuZCBrZWVwIGRvd24gb24gdGhlIG51bWJlciBvZiBpY29ucyBjcmVhdGVkXG4gICAgICAgIHRoaXMuX2ljb25zID0ge307XG4gICAgICAgIC8vIGNyZWF0ZSBiYXNlIGljb25cbiAgICAgICAgdGhpcy5pY29uID0gdGhpcy5fY3JlYXRlSWNvbih0aGlzLl9zeW1ib2xKc29uKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX2ZpbGxTdHlsZXMoKTtcbiAgICAgIH1cbiAgICB9XG4gIH0sXG5cbiAgLy8gcHJldmVudCBodG1sIGluamVjdGlvbiBpbiBzdHJpbmdzXG4gIHNhbml0aXplOiBmdW5jdGlvbiAoc3RyKSB7XG4gICAgaWYgKCFzdHIpIHtcbiAgICAgIHJldHVybiAnJztcbiAgICB9XG4gICAgdmFyIHRleHQ7XG4gICAgdHJ5IHtcbiAgICAgIC8vIHJlbW92ZXMgaHRtbCBidXQgbGVhdmVzIHVybCBsaW5rIHRleHRcbiAgICAgIHRleHQgPSBzdHIucmVwbGFjZSgvPGJyPi9naSwgJ1xcbicpO1xuICAgICAgdGV4dCA9IHRleHQucmVwbGFjZSgvPHAuKj4vZ2ksICdcXG4nKTtcbiAgICAgIHRleHQgPSB0ZXh0LnJlcGxhY2UoLzxhLipocmVmPScoLio/KScuKj4oLio/KTxcXC9hPi9naSwgJyAkMiAoJDEpICcpO1xuICAgICAgdGV4dCA9IHRleHQucmVwbGFjZSgvPCg/Oi58XFxzKSo/Pi9nLCAnJyk7XG4gICAgfSBjYXRjaCAoZXgpIHtcbiAgICAgIHRleHQgPSBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gdGV4dDtcbiAgfSxcblxuICBfZmlsbFN0eWxlczogZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLl9zeW1ib2xKc29uLm91dGxpbmUgJiYgdGhpcy5fc3ltYm9sSnNvbi5zaXplID4gMCAmJiB0aGlzLl9zeW1ib2xKc29uLm91dGxpbmUuc3R5bGUgIT09ICdlc3JpU0xTTnVsbCcpIHtcbiAgICAgIHRoaXMuX3N0eWxlcy5zdHJva2UgPSB0cnVlO1xuICAgICAgdGhpcy5fc3R5bGVzLndlaWdodCA9IHRoaXMucGl4ZWxWYWx1ZSh0aGlzLl9zeW1ib2xKc29uLm91dGxpbmUud2lkdGgpO1xuICAgICAgdGhpcy5fc3R5bGVzLmNvbG9yID0gdGhpcy5jb2xvclZhbHVlKHRoaXMuX3N5bWJvbEpzb24ub3V0bGluZS5jb2xvcik7XG4gICAgICB0aGlzLl9zdHlsZXMub3BhY2l0eSA9IHRoaXMuYWxwaGFWYWx1ZSh0aGlzLl9zeW1ib2xKc29uLm91dGxpbmUuY29sb3IpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl9zdHlsZXMuc3Ryb2tlID0gZmFsc2U7XG4gICAgfVxuICAgIGlmICh0aGlzLl9zeW1ib2xKc29uLmNvbG9yKSB7XG4gICAgICB0aGlzLl9zdHlsZXMuZmlsbENvbG9yID0gdGhpcy5jb2xvclZhbHVlKHRoaXMuX3N5bWJvbEpzb24uY29sb3IpO1xuICAgICAgdGhpcy5fc3R5bGVzLmZpbGxPcGFjaXR5ID0gdGhpcy5hbHBoYVZhbHVlKHRoaXMuX3N5bWJvbEpzb24uY29sb3IpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl9zdHlsZXMuZmlsbE9wYWNpdHkgPSAwO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl9zeW1ib2xKc29uLnN0eWxlID09PSAnZXNyaVNNU0NpcmNsZScpIHtcbiAgICAgIHRoaXMuX3N0eWxlcy5yYWRpdXMgPSB0aGlzLnBpeGVsVmFsdWUodGhpcy5fc3ltYm9sSnNvbi5zaXplKSAvIDIuMDtcbiAgICB9XG4gIH0sXG5cbiAgX2NyZWF0ZUljb246IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgdmFyIHdpZHRoID0gdGhpcy5waXhlbFZhbHVlKG9wdGlvbnMud2lkdGgpO1xuICAgIHZhciBoZWlnaHQgPSB3aWR0aDtcbiAgICBpZiAob3B0aW9ucy5oZWlnaHQpIHtcbiAgICAgIGhlaWdodCA9IHRoaXMucGl4ZWxWYWx1ZShvcHRpb25zLmhlaWdodCk7XG4gICAgfVxuICAgIHZhciB4T2Zmc2V0ID0gd2lkdGggLyAyLjA7XG4gICAgdmFyIHlPZmZzZXQgPSBoZWlnaHQgLyAyLjA7XG5cbiAgICBpZiAob3B0aW9ucy54b2Zmc2V0KSB7XG4gICAgICB4T2Zmc2V0ICs9IHRoaXMucGl4ZWxWYWx1ZShvcHRpb25zLnhvZmZzZXQpO1xuICAgIH1cbiAgICBpZiAob3B0aW9ucy55b2Zmc2V0KSB7XG4gICAgICB5T2Zmc2V0ICs9IHRoaXMucGl4ZWxWYWx1ZShvcHRpb25zLnlvZmZzZXQpO1xuICAgIH1cblxuICAgIHZhciBpY29uID0gTC5pY29uKHtcbiAgICAgIGljb25Vcmw6IHRoaXMuX2ljb25VcmwsXG4gICAgICBpY29uU2l6ZTogW3dpZHRoLCBoZWlnaHRdLFxuICAgICAgaWNvbkFuY2hvcjogW3hPZmZzZXQsIHlPZmZzZXRdXG4gICAgfSk7XG4gICAgdGhpcy5faWNvbnNbb3B0aW9ucy53aWR0aC50b1N0cmluZygpXSA9IGljb247XG4gICAgcmV0dXJuIGljb247XG4gIH0sXG5cbiAgX2dldEljb246IGZ1bmN0aW9uIChzaXplKSB7XG4gICAgLy8gY2hlY2sgdG8gc2VlIGlmIGl0IGlzIGFscmVhZHkgY3JlYXRlZCBieSBzaXplXG4gICAgdmFyIGljb24gPSB0aGlzLl9pY29uc1tzaXplLnRvU3RyaW5nKCldO1xuICAgIGlmICghaWNvbikge1xuICAgICAgaWNvbiA9IHRoaXMuX2NyZWF0ZUljb24oe3dpZHRoOiBzaXplfSk7XG4gICAgfVxuICAgIHJldHVybiBpY29uO1xuICB9LFxuXG4gIHBvaW50VG9MYXllcjogZnVuY3Rpb24gKGdlb2pzb24sIGxhdGxuZywgdmlzdWFsVmFyaWFibGVzLCBvcHRpb25zKSB7XG4gICAgdmFyIHNpemUgPSB0aGlzLl9zeW1ib2xKc29uLnNpemUgfHwgdGhpcy5fc3ltYm9sSnNvbi53aWR0aDtcbiAgICBpZiAoIXRoaXMuX2lzRGVmYXVsdCkge1xuICAgICAgaWYgKHZpc3VhbFZhcmlhYmxlcy5zaXplSW5mbykge1xuICAgICAgICB2YXIgY2FsY3VsYXRlZFNpemUgPSB0aGlzLmdldFNpemUoZ2VvanNvbiwgdmlzdWFsVmFyaWFibGVzLnNpemVJbmZvKTtcbiAgICAgICAgaWYgKGNhbGN1bGF0ZWRTaXplKSB7XG4gICAgICAgICAgc2l6ZSA9IGNhbGN1bGF0ZWRTaXplO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAodmlzdWFsVmFyaWFibGVzLmNvbG9ySW5mbykge1xuICAgICAgICB2YXIgY29sb3IgPSB0aGlzLmdldENvbG9yKGdlb2pzb24sIHZpc3VhbFZhcmlhYmxlcy5jb2xvckluZm8pO1xuICAgICAgICBpZiAoY29sb3IpIHtcbiAgICAgICAgICB0aGlzLl9zdHlsZXMuZmlsbENvbG9yID0gdGhpcy5jb2xvclZhbHVlKGNvbG9yKTtcbiAgICAgICAgICB0aGlzLl9zdHlsZXMuZmlsbE9wYWNpdHkgPSB0aGlzLmFscGhhVmFsdWUoY29sb3IpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3N5bWJvbEpzb24udHlwZSA9PT0gJ2VzcmlQTVMnKSB7XG4gICAgICB2YXIgbGF5ZXJPcHRpb25zID0gTC5leHRlbmQoe30sIHtpY29uOiB0aGlzLl9nZXRJY29uKHNpemUpfSwgb3B0aW9ucyk7XG4gICAgICByZXR1cm4gTC5tYXJrZXIobGF0bG5nLCBsYXllck9wdGlvbnMpO1xuICAgIH1cbiAgICBzaXplID0gdGhpcy5waXhlbFZhbHVlKHNpemUpO1xuXG4gICAgc3dpdGNoICh0aGlzLl9zeW1ib2xKc29uLnN0eWxlKSB7XG4gICAgICBjYXNlICdlc3JpU01TU3F1YXJlJzpcbiAgICAgICAgcmV0dXJuIHNxdWFyZU1hcmtlcihsYXRsbmcsIHNpemUsIEwuZXh0ZW5kKHt9LCB0aGlzLl9zdHlsZXMsIG9wdGlvbnMpKTtcbiAgICAgIGNhc2UgJ2VzcmlTTVNEaWFtb25kJzpcbiAgICAgICAgcmV0dXJuIGRpYW1vbmRNYXJrZXIobGF0bG5nLCBzaXplLCBMLmV4dGVuZCh7fSwgdGhpcy5fc3R5bGVzLCBvcHRpb25zKSk7XG4gICAgICBjYXNlICdlc3JpU01TQ3Jvc3MnOlxuICAgICAgICByZXR1cm4gY3Jvc3NNYXJrZXIobGF0bG5nLCBzaXplLCBMLmV4dGVuZCh7fSwgdGhpcy5fc3R5bGVzLCBvcHRpb25zKSk7XG4gICAgICBjYXNlICdlc3JpU01TWCc6XG4gICAgICAgIHJldHVybiB4TWFya2VyKGxhdGxuZywgc2l6ZSwgTC5leHRlbmQoe30sIHRoaXMuX3N0eWxlcywgb3B0aW9ucykpO1xuICAgIH1cbiAgICB0aGlzLl9zdHlsZXMucmFkaXVzID0gc2l6ZSAvIDIuMDtcbiAgICByZXR1cm4gTC5jaXJjbGVNYXJrZXIobGF0bG5nLCBMLmV4dGVuZCh7fSwgdGhpcy5fc3R5bGVzLCBvcHRpb25zKSk7XG4gIH1cbn0pO1xuXG5leHBvcnQgZnVuY3Rpb24gcG9pbnRTeW1ib2wgKHN5bWJvbEpzb24sIG9wdGlvbnMpIHtcbiAgcmV0dXJuIG5ldyBQb2ludFN5bWJvbChzeW1ib2xKc29uLCBvcHRpb25zKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgcG9pbnRTeW1ib2w7XG4iLCJpbXBvcnQgU3ltYm9sIGZyb20gJy4vU3ltYm9sJztcblxuZXhwb3J0IHZhciBMaW5lU3ltYm9sID0gU3ltYm9sLmV4dGVuZCh7XG4gIHN0YXRpY3M6IHtcbiAgICAvLyBOb3QgaW1wbGVtZW50ZWQgJ2VzcmlTTFNOdWxsJ1xuICAgIExJTkVUWVBFUzogWydlc3JpU0xTRGFzaCcsICdlc3JpU0xTRG90JywgJ2VzcmlTTFNEYXNoRG90RG90JywgJ2VzcmlTTFNEYXNoRG90JywgJ2VzcmlTTFNTb2xpZCddXG4gIH0sXG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uIChzeW1ib2xKc29uLCBvcHRpb25zKSB7XG4gICAgU3ltYm9sLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcywgc3ltYm9sSnNvbiwgb3B0aW9ucyk7XG4gICAgdGhpcy5fZmlsbFN0eWxlcygpO1xuICB9LFxuXG4gIF9maWxsU3R5bGVzOiBmdW5jdGlvbiAoKSB7XG4gICAgLy8gc2V0IHRoZSBkZWZhdWx0cyB0aGF0IHNob3cgdXAgb24gYXJjZ2lzIG9ubGluZVxuICAgIHRoaXMuX3N0eWxlcy5saW5lQ2FwID0gJ2J1dHQnO1xuICAgIHRoaXMuX3N0eWxlcy5saW5lSm9pbiA9ICdtaXRlcic7XG4gICAgdGhpcy5fc3R5bGVzLmZpbGwgPSBmYWxzZTtcbiAgICB0aGlzLl9zdHlsZXMud2VpZ2h0ID0gMDtcblxuICAgIGlmICghdGhpcy5fc3ltYm9sSnNvbikge1xuICAgICAgcmV0dXJuIHRoaXMuX3N0eWxlcztcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fc3ltYm9sSnNvbi5jb2xvcikge1xuICAgICAgdGhpcy5fc3R5bGVzLmNvbG9yID0gdGhpcy5jb2xvclZhbHVlKHRoaXMuX3N5bWJvbEpzb24uY29sb3IpO1xuICAgICAgdGhpcy5fc3R5bGVzLm9wYWNpdHkgPSB0aGlzLmFscGhhVmFsdWUodGhpcy5fc3ltYm9sSnNvbi5jb2xvcik7XG4gICAgfVxuXG4gICAgaWYgKCFpc05hTih0aGlzLl9zeW1ib2xKc29uLndpZHRoKSkge1xuICAgICAgdGhpcy5fc3R5bGVzLndlaWdodCA9IHRoaXMucGl4ZWxWYWx1ZSh0aGlzLl9zeW1ib2xKc29uLndpZHRoKTtcblxuICAgICAgdmFyIGRhc2hWYWx1ZXMgPSBbXTtcblxuICAgICAgc3dpdGNoICh0aGlzLl9zeW1ib2xKc29uLnN0eWxlKSB7XG4gICAgICAgIGNhc2UgJ2VzcmlTTFNEYXNoJzpcbiAgICAgICAgICBkYXNoVmFsdWVzID0gWzQsIDNdO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdlc3JpU0xTRG90JzpcbiAgICAgICAgICBkYXNoVmFsdWVzID0gWzEsIDNdO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdlc3JpU0xTRGFzaERvdCc6XG4gICAgICAgICAgZGFzaFZhbHVlcyA9IFs4LCAzLCAxLCAzXTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnZXNyaVNMU0Rhc2hEb3REb3QnOlxuICAgICAgICAgIGRhc2hWYWx1ZXMgPSBbOCwgMywgMSwgMywgMSwgM107XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIC8vIHVzZSB0aGUgZGFzaCB2YWx1ZXMgYW5kIHRoZSBsaW5lIHdlaWdodCB0byBzZXQgZGFzaCBhcnJheVxuICAgICAgaWYgKGRhc2hWYWx1ZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRhc2hWYWx1ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBkYXNoVmFsdWVzW2ldICo9IHRoaXMuX3N0eWxlcy53ZWlnaHQ7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9zdHlsZXMuZGFzaEFycmF5ID0gZGFzaFZhbHVlcy5qb2luKCcsJyk7XG4gICAgICB9XG4gICAgfVxuICB9LFxuXG4gIHN0eWxlOiBmdW5jdGlvbiAoZmVhdHVyZSwgdmlzdWFsVmFyaWFibGVzKSB7XG4gICAgaWYgKCF0aGlzLl9pc0RlZmF1bHQgJiYgdmlzdWFsVmFyaWFibGVzKSB7XG4gICAgICBpZiAodmlzdWFsVmFyaWFibGVzLnNpemVJbmZvKSB7XG4gICAgICAgIHZhciBjYWxjdWxhdGVkU2l6ZSA9IHRoaXMucGl4ZWxWYWx1ZSh0aGlzLmdldFNpemUoZmVhdHVyZSwgdmlzdWFsVmFyaWFibGVzLnNpemVJbmZvKSk7XG4gICAgICAgIGlmIChjYWxjdWxhdGVkU2l6ZSkge1xuICAgICAgICAgIHRoaXMuX3N0eWxlcy53ZWlnaHQgPSBjYWxjdWxhdGVkU2l6ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHZpc3VhbFZhcmlhYmxlcy5jb2xvckluZm8pIHtcbiAgICAgICAgdmFyIGNvbG9yID0gdGhpcy5nZXRDb2xvcihmZWF0dXJlLCB2aXN1YWxWYXJpYWJsZXMuY29sb3JJbmZvKTtcbiAgICAgICAgaWYgKGNvbG9yKSB7XG4gICAgICAgICAgdGhpcy5fc3R5bGVzLmNvbG9yID0gdGhpcy5jb2xvclZhbHVlKGNvbG9yKTtcbiAgICAgICAgICB0aGlzLl9zdHlsZXMub3BhY2l0eSA9IHRoaXMuYWxwaGFWYWx1ZShjb2xvcik7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX3N0eWxlcztcbiAgfVxufSk7XG5cbmV4cG9ydCBmdW5jdGlvbiBsaW5lU3ltYm9sIChzeW1ib2xKc29uLCBvcHRpb25zKSB7XG4gIHJldHVybiBuZXcgTGluZVN5bWJvbChzeW1ib2xKc29uLCBvcHRpb25zKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgbGluZVN5bWJvbDtcbiIsImltcG9ydCBTeW1ib2wgZnJvbSAnLi9TeW1ib2wnO1xuaW1wb3J0IGxpbmVTeW1ib2wgZnJvbSAnLi9MaW5lU3ltYm9sJztcblxuZXhwb3J0IHZhciBQb2x5Z29uU3ltYm9sID0gU3ltYm9sLmV4dGVuZCh7XG4gIHN0YXRpY3M6IHtcbiAgICAvLyBub3QgaW1wbGVtZW50ZWQ6ICdlc3JpU0ZTQmFja3dhcmREaWFnb25hbCcsJ2VzcmlTRlNDcm9zcycsJ2VzcmlTRlNEaWFnb25hbENyb3NzJywnZXNyaVNGU0ZvcndhcmREaWFnb25hbCcsJ2VzcmlTRlNIb3Jpem9udGFsJywnZXNyaVNGU051bGwnLCdlc3JpU0ZTVmVydGljYWwnXG4gICAgUE9MWUdPTlRZUEVTOiBbJ2VzcmlTRlNTb2xpZCddXG4gIH0sXG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uIChzeW1ib2xKc29uLCBvcHRpb25zKSB7XG4gICAgU3ltYm9sLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcywgc3ltYm9sSnNvbiwgb3B0aW9ucyk7XG4gICAgaWYgKHN5bWJvbEpzb24pIHtcbiAgICAgIGlmIChzeW1ib2xKc29uLm91dGxpbmUgJiYgc3ltYm9sSnNvbi5vdXRsaW5lLnN0eWxlID09PSAnZXNyaVNMU051bGwnKSB7XG4gICAgICAgIHRoaXMuX2xpbmVTdHlsZXMgPSB7IHdlaWdodDogMCB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fbGluZVN0eWxlcyA9IGxpbmVTeW1ib2woc3ltYm9sSnNvbi5vdXRsaW5lLCBvcHRpb25zKS5zdHlsZSgpO1xuICAgICAgfVxuICAgICAgdGhpcy5fZmlsbFN0eWxlcygpO1xuICAgIH1cbiAgfSxcblxuICBfZmlsbFN0eWxlczogZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLl9saW5lU3R5bGVzKSB7XG4gICAgICBpZiAodGhpcy5fbGluZVN0eWxlcy53ZWlnaHQgPT09IDApIHtcbiAgICAgICAgLy8gd2hlbiB3ZWlnaHQgaXMgMCwgc2V0dGluZyB0aGUgc3Ryb2tlIHRvIGZhbHNlIGNhbiBzdGlsbCBsb29rIGJhZFxuICAgICAgICAvLyAoZ2FwcyBiZXR3ZWVuIHRoZSBwb2x5Z29ucylcbiAgICAgICAgdGhpcy5fc3R5bGVzLnN0cm9rZSA9IGZhbHNlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gY29weSB0aGUgbGluZSBzeW1ib2wgc3R5bGVzIGludG8gdGhpcyBzeW1ib2wncyBzdHlsZXNcbiAgICAgICAgZm9yICh2YXIgc3R5bGVBdHRyIGluIHRoaXMuX2xpbmVTdHlsZXMpIHtcbiAgICAgICAgICB0aGlzLl9zdHlsZXNbc3R5bGVBdHRyXSA9IHRoaXMuX2xpbmVTdHlsZXNbc3R5bGVBdHRyXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIHNldCB0aGUgZmlsbCBmb3IgdGhlIHBvbHlnb25cbiAgICBpZiAodGhpcy5fc3ltYm9sSnNvbikge1xuICAgICAgaWYgKHRoaXMuX3N5bWJvbEpzb24uY29sb3IgJiZcbiAgICAgICAgICAvLyBkb24ndCBmaWxsIHBvbHlnb24gaWYgdHlwZSBpcyBub3Qgc3VwcG9ydGVkXG4gICAgICAgICAgUG9seWdvblN5bWJvbC5QT0xZR09OVFlQRVMuaW5kZXhPZih0aGlzLl9zeW1ib2xKc29uLnN0eWxlID49IDApKSB7XG4gICAgICAgIHRoaXMuX3N0eWxlcy5maWxsID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fc3R5bGVzLmZpbGxDb2xvciA9IHRoaXMuY29sb3JWYWx1ZSh0aGlzLl9zeW1ib2xKc29uLmNvbG9yKTtcbiAgICAgICAgdGhpcy5fc3R5bGVzLmZpbGxPcGFjaXR5ID0gdGhpcy5hbHBoYVZhbHVlKHRoaXMuX3N5bWJvbEpzb24uY29sb3IpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fc3R5bGVzLmZpbGwgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fc3R5bGVzLmZpbGxPcGFjaXR5ID0gMDtcbiAgICAgIH1cbiAgICB9XG4gIH0sXG5cbiAgc3R5bGU6IGZ1bmN0aW9uIChmZWF0dXJlLCB2aXN1YWxWYXJpYWJsZXMpIHtcbiAgICBpZiAoIXRoaXMuX2lzRGVmYXVsdCAmJiB2aXN1YWxWYXJpYWJsZXMgJiYgdmlzdWFsVmFyaWFibGVzLmNvbG9ySW5mbykge1xuICAgICAgdmFyIGNvbG9yID0gdGhpcy5nZXRDb2xvcihmZWF0dXJlLCB2aXN1YWxWYXJpYWJsZXMuY29sb3JJbmZvKTtcbiAgICAgIGlmIChjb2xvcikge1xuICAgICAgICB0aGlzLl9zdHlsZXMuZmlsbENvbG9yID0gdGhpcy5jb2xvclZhbHVlKGNvbG9yKTtcbiAgICAgICAgdGhpcy5fc3R5bGVzLmZpbGxPcGFjaXR5ID0gdGhpcy5hbHBoYVZhbHVlKGNvbG9yKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX3N0eWxlcztcbiAgfVxufSk7XG5cbmV4cG9ydCBmdW5jdGlvbiBwb2x5Z29uU3ltYm9sIChzeW1ib2xKc29uLCBvcHRpb25zKSB7XG4gIHJldHVybiBuZXcgUG9seWdvblN5bWJvbChzeW1ib2xKc29uLCBvcHRpb25zKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgcG9seWdvblN5bWJvbDtcbiIsImltcG9ydCBMIGZyb20gJ2xlYWZsZXQnO1xuXG5pbXBvcnQgcG9pbnRTeW1ib2wgZnJvbSAnLi4vU3ltYm9scy9Qb2ludFN5bWJvbCc7XG5pbXBvcnQgbGluZVN5bWJvbCBmcm9tICcuLi9TeW1ib2xzL0xpbmVTeW1ib2wnO1xuaW1wb3J0IHBvbHlnb25TeW1ib2wgZnJvbSAnLi4vU3ltYm9scy9Qb2x5Z29uU3ltYm9sJztcblxuZXhwb3J0IHZhciBSZW5kZXJlciA9IEwuQ2xhc3MuZXh0ZW5kKHtcbiAgb3B0aW9uczoge1xuICAgIHByb3BvcnRpb25hbFBvbHlnb246IGZhbHNlLFxuICAgIGNsaWNrYWJsZTogdHJ1ZVxuICB9LFxuXG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uIChyZW5kZXJlckpzb24sIG9wdGlvbnMpIHtcbiAgICB0aGlzLl9yZW5kZXJlckpzb24gPSByZW5kZXJlckpzb247XG4gICAgdGhpcy5fcG9pbnRTeW1ib2xzID0gZmFsc2U7XG4gICAgdGhpcy5fc3ltYm9scyA9IFtdO1xuICAgIHRoaXMuX3Zpc3VhbFZhcmlhYmxlcyA9IHRoaXMuX3BhcnNlVmlzdWFsVmFyaWFibGVzKHJlbmRlcmVySnNvbi52aXN1YWxWYXJpYWJsZXMpO1xuICAgIEwuVXRpbC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xuICB9LFxuXG4gIF9wYXJzZVZpc3VhbFZhcmlhYmxlczogZnVuY3Rpb24gKHZpc3VhbFZhcmlhYmxlcykge1xuICAgIHZhciB2aXNWYXJzID0ge307XG4gICAgaWYgKHZpc3VhbFZhcmlhYmxlcykge1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB2aXN1YWxWYXJpYWJsZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmlzVmFyc1t2aXN1YWxWYXJpYWJsZXNbaV0udHlwZV0gPSB2aXN1YWxWYXJpYWJsZXNbaV07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB2aXNWYXJzO1xuICB9LFxuXG4gIF9jcmVhdGVEZWZhdWx0U3ltYm9sOiBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMuX3JlbmRlcmVySnNvbi5kZWZhdWx0U3ltYm9sKSB7XG4gICAgICB0aGlzLl9kZWZhdWx0U3ltYm9sID0gdGhpcy5fbmV3U3ltYm9sKHRoaXMuX3JlbmRlcmVySnNvbi5kZWZhdWx0U3ltYm9sKTtcbiAgICAgIHRoaXMuX2RlZmF1bHRTeW1ib2wuX2lzRGVmYXVsdCA9IHRydWU7XG4gICAgfVxuICB9LFxuXG4gIF9uZXdTeW1ib2w6IGZ1bmN0aW9uIChzeW1ib2xKc29uKSB7XG4gICAgaWYgKHN5bWJvbEpzb24udHlwZSA9PT0gJ2VzcmlTTVMnIHx8IHN5bWJvbEpzb24udHlwZSA9PT0gJ2VzcmlQTVMnKSB7XG4gICAgICB0aGlzLl9wb2ludFN5bWJvbHMgPSB0cnVlO1xuICAgICAgcmV0dXJuIHBvaW50U3ltYm9sKHN5bWJvbEpzb24sIHRoaXMub3B0aW9ucyk7XG4gICAgfVxuICAgIGlmIChzeW1ib2xKc29uLnR5cGUgPT09ICdlc3JpU0xTJykge1xuICAgICAgcmV0dXJuIGxpbmVTeW1ib2woc3ltYm9sSnNvbiwgdGhpcy5vcHRpb25zKTtcbiAgICB9XG4gICAgaWYgKHN5bWJvbEpzb24udHlwZSA9PT0gJ2VzcmlTRlMnKSB7XG4gICAgICByZXR1cm4gcG9seWdvblN5bWJvbChzeW1ib2xKc29uLCB0aGlzLm9wdGlvbnMpO1xuICAgIH1cbiAgfSxcblxuICBfZ2V0U3ltYm9sOiBmdW5jdGlvbiAoKSB7XG4gICAgLy8gb3ZlcnJpZGVcbiAgfSxcblxuICBhdHRhY2hTdHlsZXNUb0xheWVyOiBmdW5jdGlvbiAobGF5ZXIpIHtcbiAgICBpZiAodGhpcy5fcG9pbnRTeW1ib2xzKSB7XG4gICAgICBsYXllci5vcHRpb25zLnBvaW50VG9MYXllciA9IEwuVXRpbC5iaW5kKHRoaXMucG9pbnRUb0xheWVyLCB0aGlzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGF5ZXIub3B0aW9ucy5zdHlsZSA9IEwuVXRpbC5iaW5kKHRoaXMuc3R5bGUsIHRoaXMpO1xuICAgICAgbGF5ZXIuX29yaWdpbmFsU3R5bGUgPSBsYXllci5vcHRpb25zLnN0eWxlO1xuICAgIH1cbiAgfSxcblxuICBwb2ludFRvTGF5ZXI6IGZ1bmN0aW9uIChnZW9qc29uLCBsYXRsbmcpIHtcbiAgICB2YXIgc3ltID0gdGhpcy5fZ2V0U3ltYm9sKGdlb2pzb24pO1xuICAgIGlmIChzeW0gJiYgc3ltLnBvaW50VG9MYXllcikge1xuICAgICAgLy8gcmlnaHQgbm93IGN1c3RvbSBwYW5lcyBhcmUgdGhlIG9ubHkgb3B0aW9uIHB1c2hlZCB0aHJvdWdoXG4gICAgICByZXR1cm4gc3ltLnBvaW50VG9MYXllcihnZW9qc29uLCBsYXRsbmcsIHRoaXMuX3Zpc3VhbFZhcmlhYmxlcywgdGhpcy5vcHRpb25zKTtcbiAgICB9XG4gICAgLy8gaW52aXNpYmxlIHN5bWJvbG9neVxuICAgIHJldHVybiBMLmNpcmNsZU1hcmtlcihsYXRsbmcsIHtyYWRpdXM6IDAsIG9wYWNpdHk6IDB9KTtcbiAgfSxcblxuICBzdHlsZTogZnVuY3Rpb24gKGZlYXR1cmUpIHtcbiAgICB2YXIgdXNlclN0eWxlcztcbiAgICBpZiAodGhpcy5vcHRpb25zLnVzZXJEZWZpbmVkU3R5bGUpIHtcbiAgICAgIHVzZXJTdHlsZXMgPSB0aGlzLm9wdGlvbnMudXNlckRlZmluZWRTdHlsZShmZWF0dXJlKTtcbiAgICB9XG4gICAgLy8gZmluZCB0aGUgc3ltYm9sIHRvIHJlcHJlc2VudCB0aGlzIGZlYXR1cmVcbiAgICB2YXIgc3ltID0gdGhpcy5fZ2V0U3ltYm9sKGZlYXR1cmUpO1xuICAgIGlmIChzeW0pIHtcbiAgICAgIHJldHVybiB0aGlzLm1lcmdlU3R5bGVzKHN5bS5zdHlsZShmZWF0dXJlLCB0aGlzLl92aXN1YWxWYXJpYWJsZXMpLCB1c2VyU3R5bGVzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gaW52aXNpYmxlIHN5bWJvbG9neVxuICAgICAgcmV0dXJuIHRoaXMubWVyZ2VTdHlsZXMoe29wYWNpdHk6IDAsIGZpbGxPcGFjaXR5OiAwfSwgdXNlclN0eWxlcyk7XG4gICAgfVxuICB9LFxuXG4gIG1lcmdlU3R5bGVzOiBmdW5jdGlvbiAoc3R5bGVzLCB1c2VyU3R5bGVzKSB7XG4gICAgdmFyIG1lcmdlZFN0eWxlcyA9IHt9O1xuICAgIHZhciBhdHRyO1xuICAgIC8vIGNvcHkgcmVuZGVyZXIgc3R5bGUgYXR0cmlidXRlc1xuICAgIGZvciAoYXR0ciBpbiBzdHlsZXMpIHtcbiAgICAgIGlmIChzdHlsZXMuaGFzT3duUHJvcGVydHkoYXR0cikpIHtcbiAgICAgICAgbWVyZ2VkU3R5bGVzW2F0dHJdID0gc3R5bGVzW2F0dHJdO1xuICAgICAgfVxuICAgIH1cbiAgICAvLyBvdmVycmlkZSB3aXRoIHVzZXIgZGVmaW5lZCBzdHlsZSBhdHRyaWJ1dGVzXG4gICAgaWYgKHVzZXJTdHlsZXMpIHtcbiAgICAgIGZvciAoYXR0ciBpbiB1c2VyU3R5bGVzKSB7XG4gICAgICAgIGlmICh1c2VyU3R5bGVzLmhhc093blByb3BlcnR5KGF0dHIpKSB7XG4gICAgICAgICAgbWVyZ2VkU3R5bGVzW2F0dHJdID0gdXNlclN0eWxlc1thdHRyXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbWVyZ2VkU3R5bGVzO1xuICB9XG59KTtcblxuZXhwb3J0IGRlZmF1bHQgUmVuZGVyZXI7XG4iLCJpbXBvcnQgUmVuZGVyZXIgZnJvbSAnLi9SZW5kZXJlcic7XG5cbmV4cG9ydCB2YXIgQ2xhc3NCcmVha3NSZW5kZXJlciA9IFJlbmRlcmVyLmV4dGVuZCh7XG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uIChyZW5kZXJlckpzb24sIG9wdGlvbnMpIHtcbiAgICBSZW5kZXJlci5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsIHJlbmRlcmVySnNvbiwgb3B0aW9ucyk7XG4gICAgdGhpcy5fZmllbGQgPSB0aGlzLl9yZW5kZXJlckpzb24uZmllbGQ7XG4gICAgaWYgKHRoaXMuX3JlbmRlcmVySnNvbi5ub3JtYWxpemF0aW9uVHlwZSAmJiB0aGlzLl9yZW5kZXJlckpzb24ubm9ybWFsaXphdGlvblR5cGUgPT09ICdlc3JpTm9ybWFsaXplQnlGaWVsZCcpIHtcbiAgICAgIHRoaXMuX25vcm1hbGl6YXRpb25GaWVsZCA9IHRoaXMuX3JlbmRlcmVySnNvbi5ub3JtYWxpemF0aW9uRmllbGQ7XG4gICAgfVxuICAgIHRoaXMuX2NyZWF0ZVN5bWJvbHMoKTtcbiAgfSxcblxuICBfY3JlYXRlU3ltYm9sczogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzeW1ib2w7XG4gICAgdmFyIGNsYXNzYnJlYWtzID0gdGhpcy5fcmVuZGVyZXJKc29uLmNsYXNzQnJlYWtJbmZvcztcblxuICAgIHRoaXMuX3N5bWJvbHMgPSBbXTtcblxuICAgIC8vIGNyZWF0ZSBhIHN5bWJvbCBmb3IgZWFjaCBjbGFzcyBicmVha1xuICAgIGZvciAodmFyIGkgPSBjbGFzc2JyZWFrcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgaWYgKHRoaXMub3B0aW9ucy5wcm9wb3J0aW9uYWxQb2x5Z29uICYmIHRoaXMuX3JlbmRlcmVySnNvbi5iYWNrZ3JvdW5kRmlsbFN5bWJvbCkge1xuICAgICAgICBzeW1ib2wgPSB0aGlzLl9uZXdTeW1ib2wodGhpcy5fcmVuZGVyZXJKc29uLmJhY2tncm91bmRGaWxsU3ltYm9sKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN5bWJvbCA9IHRoaXMuX25ld1N5bWJvbChjbGFzc2JyZWFrc1tpXS5zeW1ib2wpO1xuICAgICAgfVxuICAgICAgc3ltYm9sLnZhbCA9IGNsYXNzYnJlYWtzW2ldLmNsYXNzTWF4VmFsdWU7XG4gICAgICB0aGlzLl9zeW1ib2xzLnB1c2goc3ltYm9sKTtcbiAgICB9XG4gICAgLy8gc29ydCB0aGUgc3ltYm9scyBpbiBhc2NlbmRpbmcgdmFsdWVcbiAgICB0aGlzLl9zeW1ib2xzLnNvcnQoZnVuY3Rpb24gKGEsIGIpIHtcbiAgICAgIHJldHVybiBhLnZhbCA+IGIudmFsID8gMSA6IC0xO1xuICAgIH0pO1xuICAgIHRoaXMuX2NyZWF0ZURlZmF1bHRTeW1ib2woKTtcbiAgICB0aGlzLl9tYXhWYWx1ZSA9IHRoaXMuX3N5bWJvbHNbdGhpcy5fc3ltYm9scy5sZW5ndGggLSAxXS52YWw7XG4gIH0sXG5cbiAgX2dldFN5bWJvbDogZnVuY3Rpb24gKGZlYXR1cmUpIHtcbiAgICB2YXIgdmFsID0gZmVhdHVyZS5wcm9wZXJ0aWVzW3RoaXMuX2ZpZWxkXTtcbiAgICBpZiAodGhpcy5fbm9ybWFsaXphdGlvbkZpZWxkKSB7XG4gICAgICB2YXIgbm9ybVZhbHVlID0gZmVhdHVyZS5wcm9wZXJ0aWVzW3RoaXMuX25vcm1hbGl6YXRpb25GaWVsZF07XG4gICAgICBpZiAoIWlzTmFOKG5vcm1WYWx1ZSkgJiYgbm9ybVZhbHVlICE9PSAwKSB7XG4gICAgICAgIHZhbCA9IHZhbCAvIG5vcm1WYWx1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWZhdWx0U3ltYm9sO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh2YWwgPiB0aGlzLl9tYXhWYWx1ZSkge1xuICAgICAgcmV0dXJuIHRoaXMuX2RlZmF1bHRTeW1ib2w7XG4gICAgfVxuICAgIHZhciBzeW1ib2wgPSB0aGlzLl9zeW1ib2xzWzBdO1xuICAgIGZvciAodmFyIGkgPSB0aGlzLl9zeW1ib2xzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICBpZiAodmFsID4gdGhpcy5fc3ltYm9sc1tpXS52YWwpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBzeW1ib2wgPSB0aGlzLl9zeW1ib2xzW2ldO1xuICAgIH1cbiAgICByZXR1cm4gc3ltYm9sO1xuICB9XG59KTtcblxuZXhwb3J0IGZ1bmN0aW9uIGNsYXNzQnJlYWtzUmVuZGVyZXIgKHJlbmRlcmVySnNvbiwgb3B0aW9ucykge1xuICByZXR1cm4gbmV3IENsYXNzQnJlYWtzUmVuZGVyZXIocmVuZGVyZXJKc29uLCBvcHRpb25zKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3NCcmVha3NSZW5kZXJlcjtcbiIsImltcG9ydCBSZW5kZXJlciBmcm9tICcuL1JlbmRlcmVyJztcblxuZXhwb3J0IHZhciBVbmlxdWVWYWx1ZVJlbmRlcmVyID0gUmVuZGVyZXIuZXh0ZW5kKHtcbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKHJlbmRlcmVySnNvbiwgb3B0aW9ucykge1xuICAgIFJlbmRlcmVyLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcywgcmVuZGVyZXJKc29uLCBvcHRpb25zKTtcbiAgICB0aGlzLl9maWVsZCA9IHRoaXMuX3JlbmRlcmVySnNvbi5maWVsZDE7XG4gICAgdGhpcy5fY3JlYXRlU3ltYm9scygpO1xuICB9LFxuXG4gIF9jcmVhdGVTeW1ib2xzOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHN5bWJvbDtcbiAgICB2YXIgdW5pcXVlcyA9IHRoaXMuX3JlbmRlcmVySnNvbi51bmlxdWVWYWx1ZUluZm9zO1xuXG4gICAgLy8gY3JlYXRlIGEgc3ltYm9sIGZvciBlYWNoIHVuaXF1ZSB2YWx1ZVxuICAgIGZvciAodmFyIGkgPSB1bmlxdWVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICBzeW1ib2wgPSB0aGlzLl9uZXdTeW1ib2wodW5pcXVlc1tpXS5zeW1ib2wpO1xuICAgICAgc3ltYm9sLnZhbCA9IHVuaXF1ZXNbaV0udmFsdWU7XG4gICAgICB0aGlzLl9zeW1ib2xzLnB1c2goc3ltYm9sKTtcbiAgICB9XG4gICAgdGhpcy5fY3JlYXRlRGVmYXVsdFN5bWJvbCgpO1xuICB9LFxuXG4gIF9nZXRTeW1ib2w6IGZ1bmN0aW9uIChmZWF0dXJlKSB7XG4gICAgdmFyIHZhbCA9IGZlYXR1cmUucHJvcGVydGllc1t0aGlzLl9maWVsZF07XG4gICAgLy8gYWNjdW11bGF0ZSB2YWx1ZXMgaWYgdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBmaWVsZCBkZWZpbmVkXG4gICAgaWYgKHRoaXMuX3JlbmRlcmVySnNvbi5maWVsZERlbGltaXRlciAmJiB0aGlzLl9yZW5kZXJlckpzb24uZmllbGQyKSB7XG4gICAgICB2YXIgdmFsMiA9IGZlYXR1cmUucHJvcGVydGllc1t0aGlzLl9yZW5kZXJlckpzb24uZmllbGQyXTtcbiAgICAgIGlmICh2YWwyKSB7XG4gICAgICAgIHZhbCArPSB0aGlzLl9yZW5kZXJlckpzb24uZmllbGREZWxpbWl0ZXIgKyB2YWwyO1xuICAgICAgICB2YXIgdmFsMyA9IGZlYXR1cmUucHJvcGVydGllc1t0aGlzLl9yZW5kZXJlckpzb24uZmllbGQzXTtcbiAgICAgICAgaWYgKHZhbDMpIHtcbiAgICAgICAgICB2YWwgKz0gdGhpcy5fcmVuZGVyZXJKc29uLmZpZWxkRGVsaW1pdGVyICsgdmFsMztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBzeW1ib2wgPSB0aGlzLl9kZWZhdWx0U3ltYm9sO1xuICAgIGZvciAodmFyIGkgPSB0aGlzLl9zeW1ib2xzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAvLyB1c2luZyB0aGUgPT09IG9wZXJhdG9yIGRvZXMgbm90IHdvcmsgaWYgdGhlIGZpZWxkXG4gICAgICAvLyBvZiB0aGUgdW5pcXVlIHJlbmRlcmVyIGlzIG5vdCBhIHN0cmluZ1xuICAgICAgLyplc2xpbnQtZGlzYWJsZSAqL1xuICAgICAgaWYgKHRoaXMuX3N5bWJvbHNbaV0udmFsID09IHZhbCkge1xuICAgICAgICBzeW1ib2wgPSB0aGlzLl9zeW1ib2xzW2ldO1xuICAgICAgfVxuICAgICAgLyplc2xpbnQtZW5hYmxlICovXG4gICAgfVxuICAgIHJldHVybiBzeW1ib2w7XG4gIH1cbn0pO1xuXG5leHBvcnQgZnVuY3Rpb24gdW5pcXVlVmFsdWVSZW5kZXJlciAocmVuZGVyZXJKc29uLCBvcHRpb25zKSB7XG4gIHJldHVybiBuZXcgVW5pcXVlVmFsdWVSZW5kZXJlcihyZW5kZXJlckpzb24sIG9wdGlvbnMpO1xufVxuXG5leHBvcnQgZGVmYXVsdCB1bmlxdWVWYWx1ZVJlbmRlcmVyO1xuIiwiaW1wb3J0IFJlbmRlcmVyIGZyb20gJy4vUmVuZGVyZXInO1xuXG5leHBvcnQgdmFyIFNpbXBsZVJlbmRlcmVyID0gUmVuZGVyZXIuZXh0ZW5kKHtcbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKHJlbmRlcmVySnNvbiwgb3B0aW9ucykge1xuICAgIFJlbmRlcmVyLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcywgcmVuZGVyZXJKc29uLCBvcHRpb25zKTtcbiAgICB0aGlzLl9jcmVhdGVTeW1ib2woKTtcbiAgfSxcblxuICBfY3JlYXRlU3ltYm9sOiBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMuX3JlbmRlcmVySnNvbi5zeW1ib2wpIHtcbiAgICAgIHRoaXMuX3N5bWJvbHMucHVzaCh0aGlzLl9uZXdTeW1ib2wodGhpcy5fcmVuZGVyZXJKc29uLnN5bWJvbCkpO1xuICAgIH1cbiAgfSxcblxuICBfZ2V0U3ltYm9sOiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuX3N5bWJvbHNbMF07XG4gIH1cbn0pO1xuXG5leHBvcnQgZnVuY3Rpb24gc2ltcGxlUmVuZGVyZXIgKHJlbmRlcmVySnNvbiwgb3B0aW9ucykge1xuICByZXR1cm4gbmV3IFNpbXBsZVJlbmRlcmVyKHJlbmRlcmVySnNvbiwgb3B0aW9ucyk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IHNpbXBsZVJlbmRlcmVyO1xuIiwiaW1wb3J0IHsgY2xhc3NCcmVha3NSZW5kZXJlciB9IGZyb20gJ2VzcmktbGVhZmxldC1yZW5kZXJlcnMvc3JjL1JlbmRlcmVycy9DbGFzc0JyZWFrc1JlbmRlcmVyJztcbmltcG9ydCB7IHVuaXF1ZVZhbHVlUmVuZGVyZXIgfSBmcm9tICdlc3JpLWxlYWZsZXQtcmVuZGVyZXJzL3NyYy9SZW5kZXJlcnMvVW5pcXVlVmFsdWVSZW5kZXJlcic7XG5pbXBvcnQgeyBzaW1wbGVSZW5kZXJlciB9IGZyb20gJ2VzcmktbGVhZmxldC1yZW5kZXJlcnMvc3JjL1JlbmRlcmVycy9TaW1wbGVSZW5kZXJlcic7XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRSZW5kZXJlciAobGF5ZXJEZWZpbml0aW9uLCBsYXllcikge1xuICB2YXIgcmVuZDtcbiAgdmFyIHJlbmRlcmVySW5mbyA9IGxheWVyRGVmaW5pdGlvbi5kcmF3aW5nSW5mby5yZW5kZXJlcjtcblxuICB2YXIgb3B0aW9ucyA9IHt9O1xuXG4gIGlmIChsYXllci5vcHRpb25zLnBhbmUpIHtcbiAgICBvcHRpb25zLnBhbmUgPSBsYXllci5vcHRpb25zLnBhbmU7XG4gIH1cbiAgaWYgKGxheWVyRGVmaW5pdGlvbi5kcmF3aW5nSW5mby50cmFuc3BhcmVuY3kpIHtcbiAgICBvcHRpb25zLmxheWVyVHJhbnNwYXJlbmN5ID0gbGF5ZXJEZWZpbml0aW9uLmRyYXdpbmdJbmZvLnRyYW5zcGFyZW5jeTtcbiAgfVxuICBpZiAobGF5ZXIub3B0aW9ucy5zdHlsZSkge1xuICAgIG9wdGlvbnMudXNlckRlZmluZWRTdHlsZSA9IGxheWVyLm9wdGlvbnMuc3R5bGU7XG4gIH1cblxuICBzd2l0Y2ggKHJlbmRlcmVySW5mby50eXBlKSB7XG4gICAgY2FzZSAnY2xhc3NCcmVha3MnOlxuICAgICAgY2hlY2tGb3JQcm9wb3J0aW9uYWxTeW1ib2xzKGxheWVyRGVmaW5pdGlvbi5nZW9tZXRyeVR5cGUsIHJlbmRlcmVySW5mbywgbGF5ZXIpO1xuICAgICAgaWYgKGxheWVyLl9oYXNQcm9wb3J0aW9uYWxTeW1ib2xzKSB7XG4gICAgICAgIGxheWVyLl9jcmVhdGVQb2ludExheWVyKCk7XG4gICAgICAgIHZhciBwUmVuZCA9IGNsYXNzQnJlYWtzUmVuZGVyZXIocmVuZGVyZXJJbmZvLCBvcHRpb25zKTtcbiAgICAgICAgcFJlbmQuYXR0YWNoU3R5bGVzVG9MYXllcihsYXllci5fcG9pbnRMYXllcik7XG4gICAgICAgIG9wdGlvbnMucHJvcG9ydGlvbmFsUG9seWdvbiA9IHRydWU7XG4gICAgICB9XG4gICAgICByZW5kID0gY2xhc3NCcmVha3NSZW5kZXJlcihyZW5kZXJlckluZm8sIG9wdGlvbnMpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAndW5pcXVlVmFsdWUnOlxuICAgICAgY29uc29sZS5sb2cocmVuZGVyZXJJbmZvLCBvcHRpb25zKTtcbiAgICAgIHJlbmQgPSB1bmlxdWVWYWx1ZVJlbmRlcmVyKHJlbmRlcmVySW5mbywgb3B0aW9ucyk7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgcmVuZCA9IHNpbXBsZVJlbmRlcmVyKHJlbmRlcmVySW5mbywgb3B0aW9ucyk7XG4gIH1cbiAgcmVuZC5hdHRhY2hTdHlsZXNUb0xheWVyKGxheWVyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrRm9yUHJvcG9ydGlvbmFsU3ltYm9scyAoZ2VvbWV0cnlUeXBlLCByZW5kZXJlciwgbGF5ZXIpIHtcbiAgbGF5ZXIuX2hhc1Byb3BvcnRpb25hbFN5bWJvbHMgPSBmYWxzZTtcbiAgaWYgKGdlb21ldHJ5VHlwZSA9PT0gJ2VzcmlHZW9tZXRyeVBvbHlnb24nKSB7XG4gICAgaWYgKHJlbmRlcmVyLmJhY2tncm91bmRGaWxsU3ltYm9sKSB7XG4gICAgICBsYXllci5faGFzUHJvcG9ydGlvbmFsU3ltYm9scyA9IHRydWU7XG4gICAgfVxuICAgIC8vIGNoZWNrIHRvIHNlZSBpZiB0aGUgZmlyc3Qgc3ltYm9sIGluIHRoZSBjbGFzc2JyZWFrcyBpcyBhIG1hcmtlciBzeW1ib2xcbiAgICBpZiAocmVuZGVyZXIuY2xhc3NCcmVha0luZm9zICYmIHJlbmRlcmVyLmNsYXNzQnJlYWtJbmZvcy5sZW5ndGgpIHtcbiAgICAgIHZhciBzeW0gPSByZW5kZXJlci5jbGFzc0JyZWFrSW5mb3NbMF0uc3ltYm9sO1xuICAgICAgaWYgKHN5bSAmJiAoc3ltLnR5cGUgPT09ICdlc3JpU01TJyB8fCBzeW0udHlwZSA9PT0gJ2VzcmlQTVMnKSkge1xuICAgICAgICBsYXllci5faGFzUHJvcG9ydGlvbmFsU3ltYm9scyA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCB2YXIgUmVuZGVyZXIgPSB7XG4gIHNldFJlbmRlcmVyOiBzZXRSZW5kZXJlcixcbiAgY2hlY2tGb3JQcm9wb3J0aW9uYWxTeW1ib2xzOiBjaGVja0ZvclByb3BvcnRpb25hbFN5bWJvbHNcbn07XG5cbmV4cG9ydCBkZWZhdWx0IFJlbmRlcmVyO1xuIiwiaW1wb3J0IEwgZnJvbSAnbGVhZmxldCc7XG5cbmltcG9ydCB7IGFyY2dpc1RvR2VvSlNPTiB9IGZyb20gJ2FyY2dpcy10by1nZW9qc29uLXV0aWxzJztcbmltcG9ydCB7IHNldFJlbmRlcmVyIH0gZnJvbSAnLi9SZW5kZXJlcic7XG5cbmV4cG9ydCB2YXIgRmVhdHVyZUNvbGxlY3Rpb24gPSBMLkdlb0pTT04uZXh0ZW5kKHtcbiAgb3B0aW9uczoge1xuICAgIGRhdGE6IHt9LCAvLyBFc3JpIEZlYXR1cmUgQ29sbGVjdGlvbiBKU09OIG9yIEl0ZW0gSURcbiAgICBvcGFjaXR5OiAxXG4gIH0sXG5cbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKGxheWVycywgb3B0aW9ucykge1xuICAgIEwuc2V0T3B0aW9ucyh0aGlzLCBvcHRpb25zKTtcblxuICAgIHRoaXMuZGF0YSA9IHRoaXMub3B0aW9ucy5kYXRhO1xuICAgIHRoaXMub3BhY2l0eSA9IHRoaXMub3B0aW9ucy5vcGFjaXR5O1xuICAgIHRoaXMucG9wdXBJbmZvID0gbnVsbDtcbiAgICB0aGlzLmxhYmVsaW5nSW5mbyA9IG51bGw7XG4gICAgdGhpcy5fbGF5ZXJzID0ge307XG5cbiAgICB2YXIgaSwgbGVuO1xuXG4gICAgaWYgKGxheWVycykge1xuICAgICAgZm9yIChpID0gMCwgbGVuID0gbGF5ZXJzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIHRoaXMuYWRkTGF5ZXIobGF5ZXJzW2ldKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIHRoaXMuZGF0YSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHRoaXMuX2dldEZlYXR1cmVDb2xsZWN0aW9uKHRoaXMuZGF0YSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3BhcnNlRmVhdHVyZUNvbGxlY3Rpb24odGhpcy5kYXRhKTtcbiAgICB9XG4gIH0sXG5cbiAgX2dldEZlYXR1cmVDb2xsZWN0aW9uOiBmdW5jdGlvbiAoaXRlbUlkKSB7XG4gICAgdmFyIHVybCA9ICdodHRwczovL3d3dy5hcmNnaXMuY29tL3NoYXJpbmcvcmVzdC9jb250ZW50L2l0ZW1zLycgKyBpdGVtSWQgKyAnL2RhdGEnO1xuICAgIEwuZXNyaS5yZXF1ZXN0KHVybCwge30sIGZ1bmN0aW9uIChlcnIsIHJlcykge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBjb25zb2xlLmxvZyhlcnIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fcGFyc2VGZWF0dXJlQ29sbGVjdGlvbihyZXMpO1xuICAgICAgfVxuICAgIH0sIHRoaXMpO1xuICB9LFxuXG4gIF9wYXJzZUZlYXR1cmVDb2xsZWN0aW9uOiBmdW5jdGlvbiAoZGF0YSkge1xuICAgIHZhciBpLCBsZW47XG4gICAgdmFyIGluZGV4ID0gMDtcbiAgICBmb3IgKGkgPSAwLCBsZW4gPSBkYXRhLmxheWVycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgaWYgKGRhdGEubGF5ZXJzW2ldLmZlYXR1cmVTZXQuZmVhdHVyZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBpbmRleCA9IGk7XG4gICAgICB9XG4gICAgfVxuICAgIHZhciBmZWF0dXJlcyA9IGRhdGEubGF5ZXJzW2luZGV4XS5mZWF0dXJlU2V0LmZlYXR1cmVzO1xuICAgIHZhciBnZW9tZXRyeVR5cGUgPSBkYXRhLmxheWVyc1tpbmRleF0ubGF5ZXJEZWZpbml0aW9uLmdlb21ldHJ5VHlwZTsgLy8gJ2VzcmlHZW9tZXRyeVBvaW50JyB8ICdlc3JpR2VvbWV0cnlNdWx0aXBvaW50JyB8ICdlc3JpR2VvbWV0cnlQb2x5bGluZScgfCAnZXNyaUdlb21ldHJ5UG9seWdvbicgfCAnZXNyaUdlb21ldHJ5RW52ZWxvcGUnXG4gICAgdmFyIG9iamVjdElkRmllbGQgPSBkYXRhLmxheWVyc1tpbmRleF0ubGF5ZXJEZWZpbml0aW9uLm9iamVjdElkRmllbGQ7XG4gICAgdmFyIGxheWVyRGVmaW5pdGlvbiA9IGRhdGEubGF5ZXJzW2luZGV4XS5sYXllckRlZmluaXRpb24gfHwgbnVsbDtcblxuICAgIGlmIChkYXRhLmxheWVyc1tpbmRleF0ubGF5ZXJEZWZpbml0aW9uLmV4dGVudC5zcGF0aWFsUmVmZXJlbmNlLndraWQgIT09IDQzMjYpIHtcbiAgICAgIGlmIChkYXRhLmxheWVyc1tpbmRleF0ubGF5ZXJEZWZpbml0aW9uLmV4dGVudC5zcGF0aWFsUmVmZXJlbmNlLndraWQgIT09IDEwMjEwMCkge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdbTC5lc3JpLldlYk1hcF0gdGhpcyB3a2lkICgnICsgZGF0YS5sYXllcnNbaW5kZXhdLmxheWVyRGVmaW5pdGlvbi5leHRlbnQuc3BhdGlhbFJlZmVyZW5jZS53a2lkICsgJykgaXMgbm90IHN1cHBvcnRlZC4nKTtcbiAgICAgIH1cbiAgICAgIGZlYXR1cmVzID0gdGhpcy5fcHJvalRvNDMyNihmZWF0dXJlcywgZ2VvbWV0cnlUeXBlKTtcbiAgICB9XG4gICAgaWYgKGRhdGEubGF5ZXJzW2luZGV4XS5wb3B1cEluZm8gIT09IHVuZGVmaW5lZCkge1xuICAgICAgdGhpcy5wb3B1cEluZm8gPSBkYXRhLmxheWVyc1tpbmRleF0ucG9wdXBJbmZvO1xuICAgIH1cbiAgICBpZiAoZGF0YS5sYXllcnNbaW5kZXhdLmxheWVyRGVmaW5pdGlvbi5kcmF3aW5nSW5mby5sYWJlbGluZ0luZm8gIT09IHVuZGVmaW5lZCkge1xuICAgICAgdGhpcy5sYWJlbGluZ0luZm8gPSBkYXRhLmxheWVyc1tpbmRleF0ubGF5ZXJEZWZpbml0aW9uLmRyYXdpbmdJbmZvLmxhYmVsaW5nSW5mbztcbiAgICB9XG4gICAgY29uc29sZS5sb2coZGF0YSk7XG5cbiAgICB2YXIgZ2VvanNvbiA9IHRoaXMuX2ZlYXR1cmVDb2xsZWN0aW9uVG9HZW9KU09OKGZlYXR1cmVzLCBvYmplY3RJZEZpZWxkKTtcblxuICAgIGlmIChsYXllckRlZmluaXRpb24gIT09IG51bGwpIHtcbiAgICAgIHNldFJlbmRlcmVyKGxheWVyRGVmaW5pdGlvbiwgdGhpcyk7XG4gICAgfVxuICAgIGNvbnNvbGUubG9nKGdlb2pzb24pO1xuICAgIHRoaXMuYWRkRGF0YShnZW9qc29uKTtcbiAgfSxcblxuICBfcHJvalRvNDMyNjogZnVuY3Rpb24gKGZlYXR1cmVzLCBnZW9tZXRyeVR5cGUpIHtcbiAgICBjb25zb2xlLmxvZygnX3Byb2plY3QhJyk7XG4gICAgdmFyIGksIGxlbjtcbiAgICB2YXIgcHJvakZlYXR1cmVzID0gW107XG5cbiAgICBmb3IgKGkgPSAwLCBsZW4gPSBmZWF0dXJlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgdmFyIGYgPSBmZWF0dXJlc1tpXTtcbiAgICAgIHZhciBtZXJjYXRvclRvTGF0bG5nO1xuICAgICAgdmFyIGosIGs7XG5cbiAgICAgIGlmIChnZW9tZXRyeVR5cGUgPT09ICdlc3JpR2VvbWV0cnlQb2ludCcpIHtcbiAgICAgICAgbWVyY2F0b3JUb0xhdGxuZyA9IEwuUHJvamVjdGlvbi5TcGhlcmljYWxNZXJjYXRvci51bnByb2plY3QoTC5wb2ludChmLmdlb21ldHJ5LngsIGYuZ2VvbWV0cnkueSkpO1xuICAgICAgICBmLmdlb21ldHJ5LnggPSBtZXJjYXRvclRvTGF0bG5nLmxuZztcbiAgICAgICAgZi5nZW9tZXRyeS55ID0gbWVyY2F0b3JUb0xhdGxuZy5sYXQ7XG4gICAgICB9IGVsc2UgaWYgKGdlb21ldHJ5VHlwZSA9PT0gJ2VzcmlHZW9tZXRyeU11bHRpcG9pbnQnKSB7XG4gICAgICAgIHZhciBwbGVuO1xuXG4gICAgICAgIGZvciAoaiA9IDAsIHBsZW4gPSBmLmdlb21ldHJ5LnBvaW50cy5sZW5ndGg7IGogPCBwbGVuOyBqKyspIHtcbiAgICAgICAgICBtZXJjYXRvclRvTGF0bG5nID0gTC5Qcm9qZWN0aW9uLlNwaGVyaWNhbE1lcmNhdG9yLnVucHJvamVjdChMLnBvaW50KGYuZ2VvbWV0cnkucG9pbnRzW2pdWzBdLCBmLmdlb21ldHJ5LnBvaW50c1tqXVsxXSkpO1xuICAgICAgICAgIGYuZ2VvbWV0cnkucG9pbnRzW2pdWzBdID0gbWVyY2F0b3JUb0xhdGxuZy5sbmc7XG4gICAgICAgICAgZi5nZW9tZXRyeS5wb2ludHNbal1bMV0gPSBtZXJjYXRvclRvTGF0bG5nLmxhdDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChnZW9tZXRyeVR5cGUgPT09ICdlc3JpR2VvbWV0cnlQb2x5bGluZScpIHtcbiAgICAgICAgdmFyIHBhdGhsZW4sIHBhdGhzbGVuO1xuXG4gICAgICAgIGZvciAoaiA9IDAsIHBhdGhzbGVuID0gZi5nZW9tZXRyeS5wYXRocy5sZW5ndGg7IGogPCBwYXRoc2xlbjsgaisrKSB7XG4gICAgICAgICAgZm9yIChrID0gMCwgcGF0aGxlbiA9IGYuZ2VvbWV0cnkucGF0aHNbal0ubGVuZ3RoOyBrIDwgcGF0aGxlbjsgaysrKSB7XG4gICAgICAgICAgICBtZXJjYXRvclRvTGF0bG5nID0gTC5Qcm9qZWN0aW9uLlNwaGVyaWNhbE1lcmNhdG9yLnVucHJvamVjdChMLnBvaW50KGYuZ2VvbWV0cnkucGF0aHNbal1ba11bMF0sIGYuZ2VvbWV0cnkucGF0aHNbal1ba11bMV0pKTtcbiAgICAgICAgICAgIGYuZ2VvbWV0cnkucGF0aHNbal1ba11bMF0gPSBtZXJjYXRvclRvTGF0bG5nLmxuZztcbiAgICAgICAgICAgIGYuZ2VvbWV0cnkucGF0aHNbal1ba11bMV0gPSBtZXJjYXRvclRvTGF0bG5nLmxhdDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoZ2VvbWV0cnlUeXBlID09PSAnZXNyaUdlb21ldHJ5UG9seWdvbicpIHtcbiAgICAgICAgdmFyIHJpbmdsZW4sIHJpbmdzbGVuO1xuXG4gICAgICAgIGZvciAoaiA9IDAsIHJpbmdzbGVuID0gZi5nZW9tZXRyeS5yaW5ncy5sZW5ndGg7IGogPCByaW5nc2xlbjsgaisrKSB7XG4gICAgICAgICAgZm9yIChrID0gMCwgcmluZ2xlbiA9IGYuZ2VvbWV0cnkucmluZ3Nbal0ubGVuZ3RoOyBrIDwgcmluZ2xlbjsgaysrKSB7XG4gICAgICAgICAgICBtZXJjYXRvclRvTGF0bG5nID0gTC5Qcm9qZWN0aW9uLlNwaGVyaWNhbE1lcmNhdG9yLnVucHJvamVjdChMLnBvaW50KGYuZ2VvbWV0cnkucmluZ3Nbal1ba11bMF0sIGYuZ2VvbWV0cnkucmluZ3Nbal1ba11bMV0pKTtcbiAgICAgICAgICAgIGYuZ2VvbWV0cnkucmluZ3Nbal1ba11bMF0gPSBtZXJjYXRvclRvTGF0bG5nLmxuZztcbiAgICAgICAgICAgIGYuZ2VvbWV0cnkucmluZ3Nbal1ba11bMV0gPSBtZXJjYXRvclRvTGF0bG5nLmxhdDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHByb2pGZWF0dXJlcy5wdXNoKGYpO1xuICAgIH1cblxuICAgIHJldHVybiBwcm9qRmVhdHVyZXM7XG4gIH0sXG5cbiAgX2ZlYXR1cmVDb2xsZWN0aW9uVG9HZW9KU09OOiBmdW5jdGlvbiAoZmVhdHVyZXMsIG9iamVjdElkRmllbGQpIHtcbiAgICB2YXIgZ2VvanNvbkZlYXR1cmVDb2xsZWN0aW9uID0ge1xuICAgICAgdHlwZTogJ0ZlYXR1cmVDb2xsZWN0aW9uJyxcbiAgICAgIGZlYXR1cmVzOiBbXVxuICAgIH07XG4gICAgdmFyIGZlYXR1cmVzQXJyYXkgPSBbXTtcbiAgICB2YXIgaSwgbGVuO1xuXG4gICAgZm9yIChpID0gMCwgbGVuID0gZmVhdHVyZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIHZhciBnZW9qc29uID0gYXJjZ2lzVG9HZW9KU09OKGZlYXR1cmVzW2ldLCBvYmplY3RJZEZpZWxkKTtcbiAgICAgIGZlYXR1cmVzQXJyYXkucHVzaChnZW9qc29uKTtcbiAgICB9XG5cbiAgICBnZW9qc29uRmVhdHVyZUNvbGxlY3Rpb24uZmVhdHVyZXMgPSBmZWF0dXJlc0FycmF5O1xuXG4gICAgcmV0dXJuIGdlb2pzb25GZWF0dXJlQ29sbGVjdGlvbjtcbiAgfVxufSk7XG5cbmV4cG9ydCBmdW5jdGlvbiBmZWF0dXJlQ29sbGVjdGlvbiAoZ2VvanNvbiwgb3B0aW9ucykge1xuICByZXR1cm4gbmV3IEZlYXR1cmVDb2xsZWN0aW9uKGdlb2pzb24sIG9wdGlvbnMpO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmZWF0dXJlQ29sbGVjdGlvbjtcbiIsImltcG9ydCBMIGZyb20gJ2xlYWZsZXQnO1xuXG5pbXBvcnQgb21uaXZvcmUgZnJvbSAnbGVhZmxldC1vbW5pdm9yZSc7XG5pbXBvcnQgeyBzZXRSZW5kZXJlciB9IGZyb20gJy4vUmVuZGVyZXInO1xuXG5leHBvcnQgdmFyIENTVkxheWVyID0gTC5HZW9KU09OLmV4dGVuZCh7XG4gIG9wdGlvbnM6IHtcbiAgICB1cmw6ICcnLFxuICAgIGRhdGE6IHt9LCAvLyBFc3JpIEZlYXR1cmUgQ29sbGVjdGlvbiBKU09OIG9yIEl0ZW0gSURcbiAgICBvcGFjaXR5OiAxXG4gIH0sXG5cbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKGxheWVycywgb3B0aW9ucykge1xuICAgIEwuc2V0T3B0aW9ucyh0aGlzLCBvcHRpb25zKTtcblxuICAgIHRoaXMudXJsID0gdGhpcy5vcHRpb25zLnVybDtcbiAgICB0aGlzLmxheWVyRGVmaW5pdGlvbiA9IHRoaXMub3B0aW9ucy5sYXllckRlZmluaXRpb247XG4gICAgdGhpcy5sb2NhdGlvbkluZm8gPSB0aGlzLm9wdGlvbnMubG9jYXRpb25JbmZvO1xuICAgIHRoaXMub3BhY2l0eSA9IHRoaXMub3B0aW9ucy5vcGFjaXR5O1xuICAgIHRoaXMuX2xheWVycyA9IHt9O1xuXG4gICAgdmFyIGksIGxlbjtcblxuICAgIGlmIChsYXllcnMpIHtcbiAgICAgIGZvciAoaSA9IDAsIGxlbiA9IGxheWVycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICB0aGlzLmFkZExheWVyKGxheWVyc1tpXSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5fcGFyc2VDU1YodGhpcy51cmwsIHRoaXMubGF5ZXJEZWZpbml0aW9uLCB0aGlzLmxvY2F0aW9uSW5mbyk7XG4gIH0sXG5cbiAgX3BhcnNlQ1NWOiBmdW5jdGlvbiAodXJsLCBsYXllckRlZmluaXRpb24sIGxvY2F0aW9uSW5mbykge1xuICAgIG9tbml2b3JlLmNzdih1cmwsIHtcbiAgICAgIGxhdGZpZWxkOiBsb2NhdGlvbkluZm8ubGF0aXR1ZGVGaWVsZE5hbWUsXG4gICAgICBsb25maWVsZDogbG9jYXRpb25JbmZvLmxvbmdpdHVkZUZpZWxkTmFtZVxuICAgIH0sIHRoaXMpO1xuXG4gICAgc2V0UmVuZGVyZXIobGF5ZXJEZWZpbml0aW9uLCB0aGlzKTtcbiAgfVxufSk7XG5cbmV4cG9ydCBmdW5jdGlvbiBjc3ZMYXllciAoZ2VvanNvbiwgb3B0aW9ucykge1xuICByZXR1cm4gbmV3IENTVkxheWVyKGdlb2pzb24sIG9wdGlvbnMpO1xufVxuXG5leHBvcnQgZGVmYXVsdCBDU1ZMYXllcjtcbiIsImltcG9ydCBMIGZyb20gJ2xlYWZsZXQnO1xuXG5pbXBvcnQgeyBhcmNnaXNUb0dlb0pTT04gfSBmcm9tICdhcmNnaXMtdG8tZ2VvanNvbi11dGlscyc7XG5pbXBvcnQgeyBzZXRSZW5kZXJlciB9IGZyb20gJy4vUmVuZGVyZXInO1xuXG5leHBvcnQgdmFyIEtNTExheWVyID0gTC5HZW9KU09OLmV4dGVuZCh7XG4gIG9wdGlvbnM6IHtcbiAgICBvcGFjaXR5OiAxLFxuICAgIHVybDogJydcbiAgfSxcblxuICBpbml0aWFsaXplOiBmdW5jdGlvbiAobGF5ZXJzLCBvcHRpb25zKSB7XG4gICAgTC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xuXG4gICAgdGhpcy51cmwgPSB0aGlzLm9wdGlvbnMudXJsO1xuICAgIHRoaXMub3BhY2l0eSA9IHRoaXMub3B0aW9ucy5vcGFjaXR5O1xuICAgIHRoaXMucG9wdXBJbmZvID0gbnVsbDtcbiAgICB0aGlzLmxhYmVsaW5nSW5mbyA9IG51bGw7XG4gICAgdGhpcy5fbGF5ZXJzID0ge307XG5cbiAgICB2YXIgaSwgbGVuO1xuXG4gICAgaWYgKGxheWVycykge1xuICAgICAgZm9yIChpID0gMCwgbGVuID0gbGF5ZXJzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIHRoaXMuYWRkTGF5ZXIobGF5ZXJzW2ldKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLl9nZXRLTUwodGhpcy51cmwpO1xuICB9LFxuXG4gIF9nZXRLTUw6IGZ1bmN0aW9uICh1cmwpIHtcbiAgICB2YXIgcmVxdWVzdFVybCA9ICdodHRwOi8vdXRpbGl0eS5hcmNnaXMuY29tL3NoYXJpbmcva21sP3VybD0nICsgdXJsICsgJyZtb2RlbD1zaW1wbGUmZm9sZGVycz0mb3V0U1I9JTdCXCJ3a2lkXCIlM0E0MzI2JTdEJztcbiAgICBMLmVzcmkucmVxdWVzdChyZXF1ZXN0VXJsLCB7fSwgZnVuY3Rpb24gKGVyciwgcmVzKSB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGVycik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZyhyZXMpO1xuICAgICAgICB0aGlzLl9wYXJzZUZlYXR1cmVDb2xsZWN0aW9uKHJlcy5mZWF0dXJlQ29sbGVjdGlvbik7XG4gICAgICB9XG4gICAgfSwgdGhpcyk7XG4gIH0sXG5cbiAgX3BhcnNlRmVhdHVyZUNvbGxlY3Rpb246IGZ1bmN0aW9uIChmZWF0dXJlQ29sbGVjdGlvbikge1xuICAgIGNvbnNvbGUubG9nKCdfcGFyc2VGZWF0dXJlQ29sbGVjdGlvbicpO1xuICAgIHZhciBpO1xuICAgIGZvciAoaSA9IDA7IGkgPCAzOyBpKyspIHtcbiAgICAgIGlmIChmZWF0dXJlQ29sbGVjdGlvbi5sYXllcnNbaV0uZmVhdHVyZVNldC5mZWF0dXJlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGkpO1xuICAgICAgICB2YXIgZmVhdHVyZXMgPSBmZWF0dXJlQ29sbGVjdGlvbi5sYXllcnNbaV0uZmVhdHVyZVNldC5mZWF0dXJlcztcbiAgICAgICAgdmFyIG9iamVjdElkRmllbGQgPSBmZWF0dXJlQ29sbGVjdGlvbi5sYXllcnNbaV0ubGF5ZXJEZWZpbml0aW9uLm9iamVjdElkRmllbGQ7XG5cbiAgICAgICAgdmFyIGdlb2pzb24gPSB0aGlzLl9mZWF0dXJlQ29sbGVjdGlvblRvR2VvSlNPTihmZWF0dXJlcywgb2JqZWN0SWRGaWVsZCk7XG5cbiAgICAgICAgaWYgKGZlYXR1cmVDb2xsZWN0aW9uLmxheWVyc1tpXS5wb3B1cEluZm8gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHRoaXMucG9wdXBJbmZvID0gZmVhdHVyZUNvbGxlY3Rpb24ubGF5ZXJzW2ldLnBvcHVwSW5mbztcbiAgICAgICAgfVxuICAgICAgICBpZiAoZmVhdHVyZUNvbGxlY3Rpb24ubGF5ZXJzW2ldLmxheWVyRGVmaW5pdGlvbi5kcmF3aW5nSW5mby5sYWJlbGluZ0luZm8gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHRoaXMubGFiZWxpbmdJbmZvID0gZmVhdHVyZUNvbGxlY3Rpb24ubGF5ZXJzW2ldLmxheWVyRGVmaW5pdGlvbi5kcmF3aW5nSW5mby5sYWJlbGluZ0luZm87XG4gICAgICAgIH1cblxuICAgICAgICBzZXRSZW5kZXJlcihmZWF0dXJlQ29sbGVjdGlvbi5sYXllcnNbaV0ubGF5ZXJEZWZpbml0aW9uLCB0aGlzKTtcbiAgICAgICAgY29uc29sZS5sb2coZ2VvanNvbik7XG4gICAgICAgIHRoaXMuYWRkRGF0YShnZW9qc29uKTtcbiAgICAgIH1cbiAgICB9XG4gIH0sXG5cbiAgX2ZlYXR1cmVDb2xsZWN0aW9uVG9HZW9KU09OOiBmdW5jdGlvbiAoZmVhdHVyZXMsIG9iamVjdElkRmllbGQpIHtcbiAgICB2YXIgZ2VvanNvbkZlYXR1cmVDb2xsZWN0aW9uID0ge1xuICAgICAgdHlwZTogJ0ZlYXR1cmVDb2xsZWN0aW9uJyxcbiAgICAgIGZlYXR1cmVzOiBbXVxuICAgIH07XG4gICAgdmFyIGZlYXR1cmVzQXJyYXkgPSBbXTtcbiAgICB2YXIgaSwgbGVuO1xuXG4gICAgZm9yIChpID0gMCwgbGVuID0gZmVhdHVyZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIHZhciBnZW9qc29uID0gYXJjZ2lzVG9HZW9KU09OKGZlYXR1cmVzW2ldLCBvYmplY3RJZEZpZWxkKTtcbiAgICAgIGZlYXR1cmVzQXJyYXkucHVzaChnZW9qc29uKTtcbiAgICB9XG5cbiAgICBnZW9qc29uRmVhdHVyZUNvbGxlY3Rpb24uZmVhdHVyZXMgPSBmZWF0dXJlc0FycmF5O1xuXG4gICAgcmV0dXJuIGdlb2pzb25GZWF0dXJlQ29sbGVjdGlvbjtcbiAgfVxufSk7XG5cbmV4cG9ydCBmdW5jdGlvbiBrbWxMYXllciAoZ2VvanNvbiwgb3B0aW9ucykge1xuICByZXR1cm4gbmV3IEtNTExheWVyKGdlb2pzb24sIG9wdGlvbnMpO1xufVxuXG5leHBvcnQgZGVmYXVsdCBLTUxMYXllcjtcbiIsImltcG9ydCBMIGZyb20gJ2xlYWZsZXQnO1xuXG5leHBvcnQgdmFyIExhYmVsSWNvbiA9IEwuRGl2SWNvbi5leHRlbmQoe1xuICBvcHRpb25zOiB7XG4gICAgaWNvblNpemU6IG51bGwsXG4gICAgY2xhc3NOYW1lOiAnZXNyaS1sZWFmbGV0LXdlYm1hcC1sYWJlbHMnLFxuICAgIHRleHQ6ICcnXG4gIH0sXG5cbiAgY3JlYXRlSWNvbjogZnVuY3Rpb24gKG9sZEljb24pIHtcbiAgICB2YXIgZGl2ID0gKG9sZEljb24gJiYgb2xkSWNvbi50YWdOYW1lID09PSAnRElWJykgPyBvbGRJY29uIDogZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgdmFyIG9wdGlvbnMgPSB0aGlzLm9wdGlvbnM7XG5cbiAgICBkaXYuaW5uZXJIVE1MID0gJzxkaXYgc3R5bGU9XCJwb3NpdGlvbjogcmVsYXRpdmU7IGxlZnQ6IC01MCU7IHRleHQtc2hhZG93OiAxcHggMXB4IDBweCAjZmZmLCAtMXB4IDFweCAwcHggI2ZmZiwgMXB4IC0xcHggMHB4ICNmZmYsIC0xcHggLTFweCAwcHggI2ZmZjtcIj4nICsgb3B0aW9ucy50ZXh0ICsgJzwvZGl2Pic7XG5cbiAgICAvLyBsYWJlbC5jc3NcbiAgICBkaXYuc3R5bGUuZm9udFNpemUgPSAnMWVtJztcbiAgICBkaXYuc3R5bGUuZm9udFdlaWdodCA9ICdib2xkJztcbiAgICBkaXYuc3R5bGUudGV4dFRyYW5zZm9ybSA9ICd1cHBlcmNhc2UnO1xuICAgIGRpdi5zdHlsZS50ZXh0QWxpZ24gPSAnY2VudGVyJztcbiAgICBkaXYuc3R5bGUud2hpdGVTcGFjZSA9ICdub3dyYXAnO1xuXG4gICAgaWYgKG9wdGlvbnMuYmdQb3MpIHtcbiAgICAgIHZhciBiZ1BvcyA9IEwucG9pbnQob3B0aW9ucy5iZ1Bvcyk7XG4gICAgICBkaXYuc3R5bGUuYmFja2dyb3VuZFBvc2l0aW9uID0gKC1iZ1Bvcy54KSArICdweCAnICsgKC1iZ1Bvcy55KSArICdweCc7XG4gICAgfVxuICAgIHRoaXMuX3NldEljb25TdHlsZXMoZGl2LCAnaWNvbicpO1xuXG4gICAgcmV0dXJuIGRpdjtcbiAgfVxufSk7XG5cbmV4cG9ydCBmdW5jdGlvbiBsYWJlbEljb24gKG9wdGlvbnMpIHtcbiAgcmV0dXJuIG5ldyBMYWJlbEljb24ob3B0aW9ucyk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGxhYmVsSWNvbjtcbiIsImltcG9ydCBMIGZyb20gJ2xlYWZsZXQnO1xuaW1wb3J0IHsgbGFiZWxJY29uIH0gZnJvbSAnLi9MYWJlbEljb24nO1xuXG5leHBvcnQgdmFyIExhYmVsTWFya2VyID0gTC5NYXJrZXIuZXh0ZW5kKHtcbiAgb3B0aW9uczoge1xuICAgIHByb3BlcnRpZXM6IHt9LFxuICAgIGxhYmVsaW5nSW5mbzoge30sXG4gICAgb2Zmc2V0OiBbMCwgMF1cbiAgfSxcblxuICBpbml0aWFsaXplOiBmdW5jdGlvbiAobGF0bG5nLCBvcHRpb25zKSB7XG4gICAgTC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xuICAgIHRoaXMuX2xhdGxuZyA9IEwubGF0TG5nKGxhdGxuZyk7XG5cbiAgICB2YXIgbGFiZWxUZXh0ID0gdGhpcy5fY3JlYXRlTGFiZWxUZXh0KHRoaXMub3B0aW9ucy5wcm9wZXJ0aWVzLCB0aGlzLm9wdGlvbnMubGFiZWxpbmdJbmZvKTtcbiAgICB0aGlzLl9zZXRMYWJlbEljb24obGFiZWxUZXh0LCB0aGlzLm9wdGlvbnMub2Zmc2V0KTtcbiAgfSxcblxuICBfY3JlYXRlTGFiZWxUZXh0OiBmdW5jdGlvbiAocHJvcGVydGllcywgbGFiZWxpbmdJbmZvKSB7XG4gICAgdmFyIHIgPSAvXFxbKFteXFxdXSopXFxdL2c7XG4gICAgdmFyIGxhYmVsVGV4dCA9IGxhYmVsaW5nSW5mb1swXS5sYWJlbEV4cHJlc3Npb247XG5cbiAgICBsYWJlbFRleHQgPSBsYWJlbFRleHQucmVwbGFjZShyLCBmdW5jdGlvbiAocykge1xuICAgICAgdmFyIG0gPSByLmV4ZWMocyk7XG4gICAgICByZXR1cm4gcHJvcGVydGllc1ttWzFdXTtcbiAgICB9KTtcblxuICAgIHJldHVybiBsYWJlbFRleHQ7XG4gIH0sXG5cbiAgX3NldExhYmVsSWNvbjogZnVuY3Rpb24gKHRleHQsIG9mZnNldCkge1xuICAgIHZhciBpY29uID0gbGFiZWxJY29uKHtcbiAgICAgIHRleHQ6IHRleHQsXG4gICAgICBpY29uQW5jaG9yOiBvZmZzZXRcbiAgICB9KTtcblxuICAgIHRoaXMuc2V0SWNvbihpY29uKTtcbiAgfVxufSk7XG5cbmV4cG9ydCBmdW5jdGlvbiBsYWJlbE1hcmtlciAobGF0bG5nLCBvcHRpb25zKSB7XG4gIHJldHVybiBuZXcgTGFiZWxNYXJrZXIobGF0bG5nLCBvcHRpb25zKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgbGFiZWxNYXJrZXI7XG4iLCJleHBvcnQgZnVuY3Rpb24gcG9pbnRMYWJlbFBvcyAoY29vcmRpbmF0ZXMpIHtcbiAgdmFyIGxhYmVsUG9zID0geyBwb3NpdGlvbjogW10sIG9mZnNldDogW10gfTtcblxuICBsYWJlbFBvcy5wb3NpdGlvbiA9IGNvb3JkaW5hdGVzLnJldmVyc2UoKTtcbiAgbGFiZWxQb3Mub2Zmc2V0ID0gWzIwLCAyMF07XG5cbiAgcmV0dXJuIGxhYmVsUG9zO1xufVxuXG5leHBvcnQgdmFyIFBvaW50TGFiZWwgPSB7XG4gIHBvaW50TGFiZWxQb3M6IHBvaW50TGFiZWxQb3Ncbn07XG5cbmV4cG9ydCBkZWZhdWx0IFBvaW50TGFiZWw7XG4iLCJleHBvcnQgZnVuY3Rpb24gcG9seWxpbmVMYWJlbFBvcyAoY29vcmRpbmF0ZXMpIHtcbiAgdmFyIGxhYmVsUG9zID0geyBwb3NpdGlvbjogW10sIG9mZnNldDogW10gfTtcbiAgdmFyIGNlbnRyYWxLZXk7XG5cbiAgY2VudHJhbEtleSA9IE1hdGgucm91bmQoY29vcmRpbmF0ZXMubGVuZ3RoIC8gMik7XG4gIGxhYmVsUG9zLnBvc2l0aW9uID0gY29vcmRpbmF0ZXNbY2VudHJhbEtleV0ucmV2ZXJzZSgpO1xuICBsYWJlbFBvcy5vZmZzZXQgPSBbMCwgMF07XG5cbiAgcmV0dXJuIGxhYmVsUG9zO1xufVxuXG5leHBvcnQgdmFyIFBvbHlsaW5lTGFiZWwgPSB7XG4gIHBvbHlsaW5lTGFiZWxQb3M6IHBvbHlsaW5lTGFiZWxQb3Ncbn07XG5cbmV4cG9ydCBkZWZhdWx0IFBvbHlsaW5lTGFiZWw7XG4iLCJleHBvcnQgZnVuY3Rpb24gcG9seWdvbkxhYmVsUG9zIChsYXllciwgY29vcmRpbmF0ZXMpIHtcbiAgdmFyIGxhYmVsUG9zID0geyBwb3NpdGlvbjogW10sIG9mZnNldDogW10gfTtcblxuICBsYWJlbFBvcy5wb3NpdGlvbiA9IGxheWVyLmdldEJvdW5kcygpLmdldENlbnRlcigpO1xuICBsYWJlbFBvcy5vZmZzZXQgPSBbMCwgMF07XG5cbiAgcmV0dXJuIGxhYmVsUG9zO1xufVxuXG5leHBvcnQgdmFyIFBvbHlnb25MYWJlbCA9IHtcbiAgcG9seWdvbkxhYmVsUG9zOiBwb2x5Z29uTGFiZWxQb3Ncbn07XG5cbmV4cG9ydCBkZWZhdWx0IFBvbHlnb25MYWJlbDtcbiIsImV4cG9ydCBmdW5jdGlvbiBjcmVhdGVQb3B1cENvbnRlbnQgKHBvcHVwSW5mbywgcHJvcGVydGllcykge1xuICAvLyBjb25zb2xlLmxvZyhwb3B1cEluZm8sIHByb3BlcnRpZXMpO1xuICB2YXIgciA9IC9cXHsoW15cXF1dKilcXH0vZztcbiAgdmFyIHRpdGxlVGV4dCA9ICcnO1xuICB2YXIgY29udGVudCA9ICcnO1xuXG4gIGlmIChwb3B1cEluZm8udGl0bGUgIT09IHVuZGVmaW5lZCkge1xuICAgIHRpdGxlVGV4dCA9IHBvcHVwSW5mby50aXRsZTtcbiAgfVxuXG4gIHRpdGxlVGV4dCA9IHRpdGxlVGV4dC5yZXBsYWNlKHIsIGZ1bmN0aW9uIChzKSB7XG4gICAgdmFyIG0gPSByLmV4ZWMocyk7XG4gICAgcmV0dXJuIHByb3BlcnRpZXNbbVsxXV07XG4gIH0pO1xuXG4gIGNvbnRlbnQgPSAnPGRpdiBjbGFzcz1cImxlYWZsZXQtcG9wdXAtY29udGVudC10aXRsZVwiPjxoND4nICsgdGl0bGVUZXh0ICsgJzwvaDQ+PC9kaXY+PGRpdiBjbGFzcz1cImxlYWZsZXQtcG9wdXAtY29udGVudC1kZXNjcmlwdGlvblwiIHN0eWxlPVwibWF4LWhlaWdodDoyMDBweDtvdmVyZmxvdzphdXRvO1wiPic7XG5cbiAgaWYgKHBvcHVwSW5mby5maWVsZEluZm9zICE9PSB1bmRlZmluZWQpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBvcHVwSW5mby5maWVsZEluZm9zLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAocG9wdXBJbmZvLmZpZWxkSW5mb3NbaV0udmlzaWJsZSA9PT0gdHJ1ZSkge1xuICAgICAgICBjb250ZW50ICs9ICc8ZGl2IHN0eWxlPVwiZm9udC13ZWlnaHQ6Ym9sZDtjb2xvcjojOTk5O21hcmdpbi10b3A6NXB4O3dvcmQtYnJlYWs6YnJlYWstYWxsO1wiPicgKyBwb3B1cEluZm8uZmllbGRJbmZvc1tpXS5sYWJlbCArICc8L2Rpdj48cCBzdHlsZT1cIm1hcmdpbi10b3A6MDttYXJnaW4tYm90dG9tOjVweDt3b3JkLWJyZWFrOmJyZWFrLWFsbDtcIj4nICsgcHJvcGVydGllc1twb3B1cEluZm8uZmllbGRJbmZvc1tpXS5maWVsZE5hbWVdICsgJzwvcD4nO1xuICAgICAgfVxuICAgIH1cbiAgICBjb250ZW50ICs9ICc8L2Rpdj4nO1xuICB9IGVsc2UgaWYgKHBvcHVwSW5mby5kZXNjcmlwdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgLy8gS01MTGF5ZXIgcG9wdXBcbiAgICB2YXIgZGVzY3JpcHRpb25UZXh0ID0gcG9wdXBJbmZvLmRlc2NyaXB0aW9uLnJlcGxhY2UociwgZnVuY3Rpb24gKHMpIHtcbiAgICAgIHZhciBtID0gci5leGVjKHMpO1xuICAgICAgcmV0dXJuIHByb3BlcnRpZXNbbVsxXV07XG4gICAgfSk7XG4gICAgY29udGVudCArPSBkZXNjcmlwdGlvblRleHQgKyAnPC9kaXY+JztcbiAgfVxuXG4gIC8vIGlmIChwb3B1cEluZm8ubWVkaWFJbmZvcy5sZW5ndGggPiAwKSB7XG4gICAgLy8gSXQgZG9lcyBub3Qgc3VwcG9ydCBtZWRpYUluZm9zIGZvciBwb3B1cCBjb250ZW50cy5cbiAgLy8gfVxuXG4gIHJldHVybiBjb250ZW50O1xufVxuXG5leHBvcnQgdmFyIFBvcHVwID0ge1xuICBjcmVhdGVQb3B1cENvbnRlbnQ6IGNyZWF0ZVBvcHVwQ29udGVudFxufTtcblxuZXhwb3J0IGRlZmF1bHQgUG9wdXA7XG4iLCJpbXBvcnQgTCBmcm9tICdsZWFmbGV0JztcbmltcG9ydCB7IGZlYXR1cmVDb2xsZWN0aW9uIH0gZnJvbSAnLi9GZWF0dXJlQ29sbGVjdGlvbi9GZWF0dXJlQ29sbGVjdGlvbic7XG5pbXBvcnQgeyBjc3ZMYXllciB9IGZyb20gJy4vRmVhdHVyZUNvbGxlY3Rpb24vQ1NWTGF5ZXInO1xuaW1wb3J0IHsga21sTGF5ZXIgfSBmcm9tICcuL0ZlYXR1cmVDb2xsZWN0aW9uL0tNTExheWVyJztcbmltcG9ydCB7IGxhYmVsTWFya2VyIH0gZnJvbSAnLi9MYWJlbC9MYWJlbE1hcmtlcic7XG5pbXBvcnQgeyBwb2ludExhYmVsUG9zIH0gZnJvbSAnLi9MYWJlbC9Qb2ludExhYmVsJztcbmltcG9ydCB7IHBvbHlsaW5lTGFiZWxQb3MgfSBmcm9tICcuL0xhYmVsL1BvbHlsaW5lTGFiZWwnO1xuaW1wb3J0IHsgcG9seWdvbkxhYmVsUG9zIH0gZnJvbSAnLi9MYWJlbC9Qb2x5Z29uTGFiZWwnO1xuaW1wb3J0IHsgY3JlYXRlUG9wdXBDb250ZW50IH0gZnJvbSAnLi9Qb3B1cC9Qb3B1cCc7XG5cbmV4cG9ydCBmdW5jdGlvbiBvcGVyYXRpb25hbExheWVyIChsYXllciwgbGF5ZXJzLCBtYXAsIHBhcmFtcywgcGFuZU5hbWUpIHtcbiAgcmV0dXJuIF9nZW5lcmF0ZUVzcmlMYXllcihsYXllciwgbGF5ZXJzLCBtYXAsIHBhcmFtcywgcGFuZU5hbWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gX2dlbmVyYXRlRXNyaUxheWVyIChsYXllciwgbGF5ZXJzLCBtYXAsIHBhcmFtcywgcGFuZU5hbWUpIHtcbiAgY29uc29sZS5sb2coJ2dlbmVyYXRlRXNyaUxheWVyOiAnLCBsYXllci50aXRsZSwgbGF5ZXIpO1xuICB2YXIgbHlyO1xuICB2YXIgbGFiZWxzID0gW107XG4gIHZhciBsYWJlbHNMYXllcjtcbiAgdmFyIGxhYmVsUGFuZU5hbWUgPSBwYW5lTmFtZSArICctbGFiZWwnO1xuICB2YXIgaSwgbGVuO1xuXG4gIGlmIChsYXllci50eXBlID09PSAnRmVhdHVyZSBDb2xsZWN0aW9uJyB8fCBsYXllci5mZWF0dXJlQ29sbGVjdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc29sZS5sb2coJ2NyZWF0ZSBGZWF0dXJlQ29sbGVjdGlvbicpO1xuXG4gICAgbWFwLmNyZWF0ZVBhbmUobGFiZWxQYW5lTmFtZSk7XG5cbiAgICB2YXIgcG9wdXBJbmZvLCBsYWJlbGluZ0luZm87XG4gICAgaWYgKGxheWVyLml0ZW1JZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmb3IgKGkgPSAwLCBsZW4gPSBsYXllci5mZWF0dXJlQ29sbGVjdGlvbi5sYXllcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgaWYgKGxheWVyLmZlYXR1cmVDb2xsZWN0aW9uLmxheWVyc1tpXS5mZWF0dXJlU2V0LmZlYXR1cmVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpZiAobGF5ZXIuZmVhdHVyZUNvbGxlY3Rpb24ubGF5ZXJzW2ldLnBvcHVwSW5mbyAhPT0gdW5kZWZpbmVkICYmIGxheWVyLmZlYXR1cmVDb2xsZWN0aW9uLmxheWVyc1tpXS5wb3B1cEluZm8gIT09IG51bGwpIHtcbiAgICAgICAgICAgIHBvcHVwSW5mbyA9IGxheWVyLmZlYXR1cmVDb2xsZWN0aW9uLmxheWVyc1tpXS5wb3B1cEluZm87XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChsYXllci5mZWF0dXJlQ29sbGVjdGlvbi5sYXllcnNbaV0ubGF5ZXJEZWZpbml0aW9uLmRyYXdpbmdJbmZvLmxhYmVsaW5nSW5mbyAhPT0gdW5kZWZpbmVkICYmIGxheWVyLmZlYXR1cmVDb2xsZWN0aW9uLmxheWVyc1tpXS5sYXllckRlZmluaXRpb24uZHJhd2luZ0luZm8ubGFiZWxpbmdJbmZvICE9PSBudWxsKSB7XG4gICAgICAgICAgICBsYWJlbGluZ0luZm8gPSBsYXllci5mZWF0dXJlQ29sbGVjdGlvbi5sYXllcnNbaV0ubGF5ZXJEZWZpbml0aW9uLmRyYXdpbmdJbmZvLmxhYmVsaW5nSW5mbztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBsYWJlbHNMYXllciA9IEwuZmVhdHVyZUdyb3VwKGxhYmVscyk7XG4gICAgdmFyIGZjID0gZmVhdHVyZUNvbGxlY3Rpb24obnVsbCwge1xuICAgICAgZGF0YTogbGF5ZXIuaXRlbUlkIHx8IGxheWVyLmZlYXR1cmVDb2xsZWN0aW9uLFxuICAgICAgb3BhY2l0eTogbGF5ZXIub3BhY2l0eSxcbiAgICAgIHBhbmU6IHBhbmVOYW1lLFxuICAgICAgb25FYWNoRmVhdHVyZTogZnVuY3Rpb24gKGdlb2pzb24sIGwpIHtcbiAgICAgICAgaWYgKGZjICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBwb3B1cEluZm8gPSBmYy5wb3B1cEluZm87XG4gICAgICAgICAgbGFiZWxpbmdJbmZvID0gZmMubGFiZWxpbmdJbmZvO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwb3B1cEluZm8gIT09IHVuZGVmaW5lZCAmJiBwb3B1cEluZm8gIT09IG51bGwpIHtcbiAgICAgICAgICB2YXIgcG9wdXBDb250ZW50ID0gY3JlYXRlUG9wdXBDb250ZW50KHBvcHVwSW5mbywgZ2VvanNvbi5wcm9wZXJ0aWVzKTtcbiAgICAgICAgICBsLmJpbmRQb3B1cChwb3B1cENvbnRlbnQpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChsYWJlbGluZ0luZm8gIT09IHVuZGVmaW5lZCAmJiBsYWJlbGluZ0luZm8gIT09IG51bGwpIHtcbiAgICAgICAgICB2YXIgY29vcmRpbmF0ZXMgPSBsLmZlYXR1cmUuZ2VvbWV0cnkuY29vcmRpbmF0ZXM7XG4gICAgICAgICAgdmFyIGxhYmVsUG9zO1xuXG4gICAgICAgICAgaWYgKGwuZmVhdHVyZS5nZW9tZXRyeS50eXBlID09PSAnUG9pbnQnKSB7XG4gICAgICAgICAgICBsYWJlbFBvcyA9IHBvaW50TGFiZWxQb3MoY29vcmRpbmF0ZXMpO1xuICAgICAgICAgIH0gZWxzZSBpZiAobC5mZWF0dXJlLmdlb21ldHJ5LnR5cGUgPT09ICdMaW5lU3RyaW5nJykge1xuICAgICAgICAgICAgbGFiZWxQb3MgPSBwb2x5bGluZUxhYmVsUG9zKGNvb3JkaW5hdGVzKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGwuZmVhdHVyZS5nZW9tZXRyeS50eXBlID09PSAnTXVsdGlMaW5lU3RyaW5nJykge1xuICAgICAgICAgICAgbGFiZWxQb3MgPSBwb2x5bGluZUxhYmVsUG9zKGNvb3JkaW5hdGVzW01hdGgucm91bmQoY29vcmRpbmF0ZXMubGVuZ3RoIC8gMildKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGFiZWxQb3MgPSBwb2x5Z29uTGFiZWxQb3MobCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdmFyIGxhYmVsID0gbGFiZWxNYXJrZXIobGFiZWxQb3MucG9zaXRpb24sIHtcbiAgICAgICAgICAgIHpJbmRleE9mZnNldDogMSxcbiAgICAgICAgICAgIHByb3BlcnRpZXM6IGdlb2pzb24ucHJvcGVydGllcyxcbiAgICAgICAgICAgIGxhYmVsaW5nSW5mbzogbGFiZWxpbmdJbmZvLFxuICAgICAgICAgICAgb2Zmc2V0OiBsYWJlbFBvcy5vZmZzZXQsXG4gICAgICAgICAgICBwYW5lOiBsYWJlbFBhbmVOYW1lXG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBsYWJlbHNMYXllci5hZGRMYXllcihsYWJlbCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGx5ciA9IEwubGF5ZXJHcm91cChbZmMsIGxhYmVsc0xheWVyXSk7XG5cbiAgICBsYXllcnMucHVzaCh7IHR5cGU6ICdGQycsIHRpdGxlOiBsYXllci50aXRsZSB8fCAnJywgbGF5ZXI6IGx5ciB9KTtcblxuICAgIHJldHVybiBseXI7XG4gIH0gZWxzZSBpZiAobGF5ZXIubGF5ZXJUeXBlID09PSAnQXJjR0lTRmVhdHVyZUxheWVyJyAmJiBsYXllci5sYXllckRlZmluaXRpb24gIT09IHVuZGVmaW5lZCkge1xuICAgIHZhciB3aGVyZSA9ICcxPTEnO1xuICAgIGlmIChsYXllci5sYXllckRlZmluaXRpb24uZHJhd2luZ0luZm8gIT09IHVuZGVmaW5lZCkge1xuICAgICAgaWYgKGxheWVyLmxheWVyRGVmaW5pdGlvbi5kcmF3aW5nSW5mby5yZW5kZXJlci50eXBlID09PSAnaGVhdG1hcCcpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ2NyZWF0ZSBIZWF0bWFwTGF5ZXInKTtcbiAgICAgICAgdmFyIGdyYWRpZW50ID0ge307XG5cbiAgICAgICAgbGF5ZXIubGF5ZXJEZWZpbml0aW9uLmRyYXdpbmdJbmZvLnJlbmRlcmVyLmNvbG9yU3RvcHMubWFwKGZ1bmN0aW9uIChzdG9wKSB7XG4gICAgICAgICAgLy8gZ3JhZGllbnRbc3RvcC5yYXRpb10gPSAncmdiYSgnICsgc3RvcC5jb2xvclswXSArICcsJyArIHN0b3AuY29sb3JbMV0gKyAnLCcgKyBzdG9wLmNvbG9yWzJdICsgJywnICsgKHN0b3AuY29sb3JbM10vMjU1KSArICcpJztcbiAgICAgICAgICAvLyBncmFkaWVudFtNYXRoLnJvdW5kKHN0b3AucmF0aW8qMTAwKS8xMDBdID0gJ3JnYignICsgc3RvcC5jb2xvclswXSArICcsJyArIHN0b3AuY29sb3JbMV0gKyAnLCcgKyBzdG9wLmNvbG9yWzJdICsgJyknO1xuICAgICAgICAgIGdyYWRpZW50WyhNYXRoLnJvdW5kKHN0b3AucmF0aW8gKiAxMDApIC8gMTAwICsgNikgLyA3XSA9ICdyZ2IoJyArIHN0b3AuY29sb3JbMF0gKyAnLCcgKyBzdG9wLmNvbG9yWzFdICsgJywnICsgc3RvcC5jb2xvclsyXSArICcpJztcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbHlyID0gTC5lc3JpLkhlYXQuaGVhdG1hcEZlYXR1cmVMYXllcih7IC8vIEVzcmkgTGVhZmxldCAyLjBcbiAgICAgICAgLy8gbHlyID0gTC5lc3JpLmhlYXRtYXBGZWF0dXJlTGF5ZXIoeyAvLyBFc3JpIExlYWZsZXQgMS4wXG4gICAgICAgICAgdXJsOiBsYXllci51cmwsXG4gICAgICAgICAgdG9rZW46IHBhcmFtcy50b2tlbiB8fCBudWxsLFxuICAgICAgICAgIG1pbk9wYWNpdHk6IDAuNSxcbiAgICAgICAgICBtYXg6IGxheWVyLmxheWVyRGVmaW5pdGlvbi5kcmF3aW5nSW5mby5yZW5kZXJlci5tYXhQaXhlbEludGVuc2l0eSxcbiAgICAgICAgICBibHVyOiBsYXllci5sYXllckRlZmluaXRpb24uZHJhd2luZ0luZm8ucmVuZGVyZXIuYmx1clJhZGl1cyxcbiAgICAgICAgICByYWRpdXM6IGxheWVyLmxheWVyRGVmaW5pdGlvbi5kcmF3aW5nSW5mby5yZW5kZXJlci5ibHVyUmFkaXVzICogMS4zLFxuICAgICAgICAgIGdyYWRpZW50OiBncmFkaWVudCxcbiAgICAgICAgICBwYW5lOiBwYW5lTmFtZVxuICAgICAgICB9KTtcblxuICAgICAgICBsYXllcnMucHVzaCh7IHR5cGU6ICdITCcsIHRpdGxlOiBsYXllci50aXRsZSB8fCAnJywgbGF5ZXI6IGx5ciB9KTtcblxuICAgICAgICByZXR1cm4gbHlyO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coJ2NyZWF0ZSBBcmNHSVNGZWF0dXJlTGF5ZXIgKHdpdGggbGF5ZXJEZWZpbml0aW9uLmRyYXdpbmdJbmZvKScpO1xuICAgICAgICB2YXIgZHJhd2luZ0luZm8gPSBsYXllci5sYXllckRlZmluaXRpb24uZHJhd2luZ0luZm87XG4gICAgICAgIGRyYXdpbmdJbmZvLnRyYW5zcGFyZW5jeSA9IDEwMCAtIChsYXllci5vcGFjaXR5ICogMTAwKTtcbiAgICAgICAgY29uc29sZS5sb2coZHJhd2luZ0luZm8udHJhbnNwYXJlbmN5KTtcblxuICAgICAgICBpZiAobGF5ZXIubGF5ZXJEZWZpbml0aW9uLmRlZmluaXRpb25FeHByZXNzaW9uICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICB3aGVyZSA9IGxheWVyLmxheWVyRGVmaW5pdGlvbi5kZWZpbml0aW9uRXhwcmVzc2lvbjtcbiAgICAgICAgfVxuXG4gICAgICAgIG1hcC5jcmVhdGVQYW5lKGxhYmVsUGFuZU5hbWUpO1xuXG4gICAgICAgIGxhYmVsc0xheWVyID0gTC5mZWF0dXJlR3JvdXAobGFiZWxzKTtcblxuICAgICAgICBseXIgPSBMLmVzcmkuZmVhdHVyZUxheWVyKHtcbiAgICAgICAgICB1cmw6IGxheWVyLnVybCxcbiAgICAgICAgICB3aGVyZTogd2hlcmUsXG4gICAgICAgICAgdG9rZW46IHBhcmFtcy50b2tlbiB8fCBudWxsLFxuICAgICAgICAgIGRyYXdpbmdJbmZvOiBkcmF3aW5nSW5mbyxcbiAgICAgICAgICBwYW5lOiBwYW5lTmFtZSxcbiAgICAgICAgICBvbkVhY2hGZWF0dXJlOiBmdW5jdGlvbiAoZ2VvanNvbiwgbCkge1xuICAgICAgICAgICAgaWYgKGxheWVyLnBvcHVwSW5mbyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgIHZhciBwb3B1cENvbnRlbnQgPSBjcmVhdGVQb3B1cENvbnRlbnQobGF5ZXIucG9wdXBJbmZvLCBnZW9qc29uLnByb3BlcnRpZXMpO1xuICAgICAgICAgICAgICBsLmJpbmRQb3B1cChwb3B1cENvbnRlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGxheWVyLmxheWVyRGVmaW5pdGlvbi5kcmF3aW5nSW5mby5sYWJlbGluZ0luZm8gIT09IHVuZGVmaW5lZCAmJiBsYXllci5sYXllckRlZmluaXRpb24uZHJhd2luZ0luZm8ubGFiZWxpbmdJbmZvICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgIHZhciBsYWJlbGluZ0luZm8gPSBsYXllci5sYXllckRlZmluaXRpb24uZHJhd2luZ0luZm8ubGFiZWxpbmdJbmZvO1xuICAgICAgICAgICAgICB2YXIgY29vcmRpbmF0ZXMgPSBsLmZlYXR1cmUuZ2VvbWV0cnkuY29vcmRpbmF0ZXM7XG4gICAgICAgICAgICAgIHZhciBsYWJlbFBvcztcblxuICAgICAgICAgICAgICBpZiAobC5mZWF0dXJlLmdlb21ldHJ5LnR5cGUgPT09ICdQb2ludCcpIHtcbiAgICAgICAgICAgICAgICBsYWJlbFBvcyA9IHBvaW50TGFiZWxQb3MoY29vcmRpbmF0ZXMpO1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGwuZmVhdHVyZS5nZW9tZXRyeS50eXBlID09PSAnTGluZVN0cmluZycpIHtcbiAgICAgICAgICAgICAgICBsYWJlbFBvcyA9IHBvbHlsaW5lTGFiZWxQb3MoY29vcmRpbmF0ZXMpO1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGwuZmVhdHVyZS5nZW9tZXRyeS50eXBlID09PSAnTXVsdGlMaW5lU3RyaW5nJykge1xuICAgICAgICAgICAgICAgIGxhYmVsUG9zID0gcG9seWxpbmVMYWJlbFBvcyhjb29yZGluYXRlc1tNYXRoLnJvdW5kKGNvb3JkaW5hdGVzLmxlbmd0aCAvIDIpXSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbGFiZWxQb3MgPSBwb2x5Z29uTGFiZWxQb3MobCk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICB2YXIgbGFiZWwgPSBsYWJlbE1hcmtlcihsYWJlbFBvcy5wb3NpdGlvbiwge1xuICAgICAgICAgICAgICAgIHpJbmRleE9mZnNldDogMSxcbiAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiBnZW9qc29uLnByb3BlcnRpZXMsXG4gICAgICAgICAgICAgICAgbGFiZWxpbmdJbmZvOiBsYWJlbGluZ0luZm8sXG4gICAgICAgICAgICAgICAgb2Zmc2V0OiBsYWJlbFBvcy5vZmZzZXQsXG4gICAgICAgICAgICAgICAgcGFuZTogbGFiZWxQYW5lTmFtZVxuICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICBsYWJlbHNMYXllci5hZGRMYXllcihsYWJlbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBseXIgPSBMLmxheWVyR3JvdXAoW2x5ciwgbGFiZWxzTGF5ZXJdKTtcblxuICAgICAgICBsYXllcnMucHVzaCh7IHR5cGU6ICdGTCcsIHRpdGxlOiBsYXllci50aXRsZSB8fCAnJywgbGF5ZXI6IGx5ciB9KTtcblxuICAgICAgICByZXR1cm4gbHlyO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZygnY3JlYXRlIEFyY0dJU0ZlYXR1cmVMYXllciAod2l0aG91dCBsYXllckRlZmluaXRpb24uZHJhd2luZ0luZm8pJyk7XG5cbiAgICAgIGlmIChsYXllci5sYXllckRlZmluaXRpb24uZGVmaW5pdGlvbkV4cHJlc3Npb24gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICB3aGVyZSA9IGxheWVyLmxheWVyRGVmaW5pdGlvbi5kZWZpbml0aW9uRXhwcmVzc2lvbjtcbiAgICAgIH1cblxuICAgICAgbHlyID0gTC5lc3JpLmZlYXR1cmVMYXllcih7XG4gICAgICAgIHVybDogbGF5ZXIudXJsLFxuICAgICAgICB0b2tlbjogcGFyYW1zLnRva2VuIHx8IG51bGwsXG4gICAgICAgIHdoZXJlOiB3aGVyZSxcbiAgICAgICAgcGFuZTogcGFuZU5hbWUsXG4gICAgICAgIG9uRWFjaEZlYXR1cmU6IGZ1bmN0aW9uIChnZW9qc29uLCBsKSB7XG4gICAgICAgICAgaWYgKGxheWVyLnBvcHVwSW5mbyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB2YXIgcG9wdXBDb250ZW50ID0gY3JlYXRlUG9wdXBDb250ZW50KGxheWVyLnBvcHVwSW5mbywgZ2VvanNvbi5wcm9wZXJ0aWVzKTtcbiAgICAgICAgICAgIGwuYmluZFBvcHVwKHBvcHVwQ29udGVudCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgbGF5ZXJzLnB1c2goeyB0eXBlOiAnRkwnLCB0aXRsZTogbGF5ZXIudGl0bGUgfHwgJycsIGxheWVyOiBseXIgfSk7XG5cbiAgICAgIHJldHVybiBseXI7XG4gICAgfVxuICB9IGVsc2UgaWYgKGxheWVyLmxheWVyVHlwZSA9PT0gJ0FyY0dJU0ZlYXR1cmVMYXllcicpIHtcbiAgICBjb25zb2xlLmxvZygnY3JlYXRlIEFyY0dJU0ZlYXR1cmVMYXllcicpO1xuICAgIGx5ciA9IEwuZXNyaS5mZWF0dXJlTGF5ZXIoe1xuICAgICAgdXJsOiBsYXllci51cmwsXG4gICAgICB0b2tlbjogcGFyYW1zLnRva2VuIHx8IG51bGwsXG4gICAgICBwYW5lOiBwYW5lTmFtZSxcbiAgICAgIG9uRWFjaEZlYXR1cmU6IGZ1bmN0aW9uIChnZW9qc29uLCBsKSB7XG4gICAgICAgIGlmIChsYXllci5wb3B1cEluZm8gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHZhciBwb3B1cENvbnRlbnQgPSBjcmVhdGVQb3B1cENvbnRlbnQobGF5ZXIucG9wdXBJbmZvLCBnZW9qc29uLnByb3BlcnRpZXMpO1xuICAgICAgICAgIGwuYmluZFBvcHVwKHBvcHVwQ29udGVudCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGxheWVycy5wdXNoKHsgdHlwZTogJ0ZMJywgdGl0bGU6IGxheWVyLnRpdGxlIHx8ICcnLCBsYXllcjogbHlyIH0pO1xuXG4gICAgcmV0dXJuIGx5cjtcbiAgfSBlbHNlIGlmIChsYXllci5sYXllclR5cGUgPT09ICdDU1YnKSB7XG4gICAgbGFiZWxzTGF5ZXIgPSBMLmZlYXR1cmVHcm91cChsYWJlbHMpO1xuICAgIGx5ciA9IGNzdkxheWVyKG51bGwsIHtcbiAgICAgIHVybDogbGF5ZXIudXJsLFxuICAgICAgbGF5ZXJEZWZpbml0aW9uOiBsYXllci5sYXllckRlZmluaXRpb24sXG4gICAgICBsb2NhdGlvbkluZm86IGxheWVyLmxvY2F0aW9uSW5mbyxcbiAgICAgIG9wYWNpdHk6IGxheWVyLm9wYWNpdHksXG4gICAgICBwYW5lOiBwYW5lTmFtZSxcbiAgICAgIG9uRWFjaEZlYXR1cmU6IGZ1bmN0aW9uIChnZW9qc29uLCBsKSB7XG4gICAgICAgIGlmIChsYXllci5wb3B1cEluZm8gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHZhciBwb3B1cENvbnRlbnQgPSBjcmVhdGVQb3B1cENvbnRlbnQobGF5ZXIucG9wdXBJbmZvLCBnZW9qc29uLnByb3BlcnRpZXMpO1xuICAgICAgICAgIGwuYmluZFBvcHVwKHBvcHVwQ29udGVudCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGxheWVyLmxheWVyRGVmaW5pdGlvbi5kcmF3aW5nSW5mby5sYWJlbGluZ0luZm8gIT09IHVuZGVmaW5lZCAmJiBsYXllci5sYXllckRlZmluaXRpb24uZHJhd2luZ0luZm8ubGFiZWxpbmdJbmZvICE9PSBudWxsKSB7XG4gICAgICAgICAgdmFyIGxhYmVsaW5nSW5mbyA9IGxheWVyLmxheWVyRGVmaW5pdGlvbi5kcmF3aW5nSW5mby5sYWJlbGluZ0luZm87XG4gICAgICAgICAgdmFyIGNvb3JkaW5hdGVzID0gbC5mZWF0dXJlLmdlb21ldHJ5LmNvb3JkaW5hdGVzO1xuICAgICAgICAgIHZhciBsYWJlbFBvcztcblxuICAgICAgICAgIGlmIChsLmZlYXR1cmUuZ2VvbWV0cnkudHlwZSA9PT0gJ1BvaW50Jykge1xuICAgICAgICAgICAgbGFiZWxQb3MgPSBwb2ludExhYmVsUG9zKGNvb3JkaW5hdGVzKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGwuZmVhdHVyZS5nZW9tZXRyeS50eXBlID09PSAnTGluZVN0cmluZycpIHtcbiAgICAgICAgICAgIGxhYmVsUG9zID0gcG9seWxpbmVMYWJlbFBvcyhjb29yZGluYXRlcyk7XG4gICAgICAgICAgfSBlbHNlIGlmIChsLmZlYXR1cmUuZ2VvbWV0cnkudHlwZSA9PT0gJ011bHRpTGluZVN0cmluZycpIHtcbiAgICAgICAgICAgIGxhYmVsUG9zID0gcG9seWxpbmVMYWJlbFBvcyhjb29yZGluYXRlc1tNYXRoLnJvdW5kKGNvb3JkaW5hdGVzLmxlbmd0aCAvIDIpXSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxhYmVsUG9zID0gcG9seWdvbkxhYmVsUG9zKGwpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHZhciBsYWJlbCA9IGxhYmVsTWFya2VyKGxhYmVsUG9zLnBvc2l0aW9uLCB7XG4gICAgICAgICAgICB6SW5kZXhPZmZzZXQ6IDEsXG4gICAgICAgICAgICBwcm9wZXJ0aWVzOiBnZW9qc29uLnByb3BlcnRpZXMsXG4gICAgICAgICAgICBsYWJlbGluZ0luZm86IGxhYmVsaW5nSW5mbyxcbiAgICAgICAgICAgIG9mZnNldDogbGFiZWxQb3Mub2Zmc2V0LFxuICAgICAgICAgICAgcGFuZTogbGFiZWxQYW5lTmFtZVxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgbGFiZWxzTGF5ZXIuYWRkTGF5ZXIobGFiZWwpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBseXIgPSBMLmxheWVyR3JvdXAoW2x5ciwgbGFiZWxzTGF5ZXJdKTtcblxuICAgIGxheWVycy5wdXNoKHsgdHlwZTogJ0NTVicsIHRpdGxlOiBsYXllci50aXRsZSB8fCAnJywgbGF5ZXI6IGx5ciB9KTtcblxuICAgIHJldHVybiBseXI7XG4gIH0gZWxzZSBpZiAobGF5ZXIubGF5ZXJUeXBlID09PSAnS01MJykge1xuICAgIGxhYmVsc0xheWVyID0gTC5mZWF0dXJlR3JvdXAobGFiZWxzKTtcbiAgICB2YXIga21sID0ga21sTGF5ZXIobnVsbCwge1xuICAgICAgdXJsOiBsYXllci51cmwsXG4gICAgICBvcGFjaXR5OiBsYXllci5vcGFjaXR5LFxuICAgICAgcGFuZTogcGFuZU5hbWUsXG4gICAgICBvbkVhY2hGZWF0dXJlOiBmdW5jdGlvbiAoZ2VvanNvbiwgbCkge1xuICAgICAgICBpZiAoa21sLnBvcHVwSW5mbyAhPT0gdW5kZWZpbmVkICYmIGttbC5wb3B1cEluZm8gIT09IG51bGwpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhrbWwucG9wdXBJbmZvKTtcbiAgICAgICAgICB2YXIgcG9wdXBDb250ZW50ID0gY3JlYXRlUG9wdXBDb250ZW50KGttbC5wb3B1cEluZm8sIGdlb2pzb24ucHJvcGVydGllcyk7XG4gICAgICAgICAgbC5iaW5kUG9wdXAocG9wdXBDb250ZW50KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoa21sLmxhYmVsaW5nSW5mbyAhPT0gdW5kZWZpbmVkICYmIGttbC5sYWJlbGluZ0luZm8gIT09IG51bGwpIHtcbiAgICAgICAgICB2YXIgbGFiZWxpbmdJbmZvID0ga21sLmxhYmVsaW5nSW5mbztcbiAgICAgICAgICB2YXIgY29vcmRpbmF0ZXMgPSBsLmZlYXR1cmUuZ2VvbWV0cnkuY29vcmRpbmF0ZXM7XG4gICAgICAgICAgdmFyIGxhYmVsUG9zO1xuXG4gICAgICAgICAgaWYgKGwuZmVhdHVyZS5nZW9tZXRyeS50eXBlID09PSAnUG9pbnQnKSB7XG4gICAgICAgICAgICBsYWJlbFBvcyA9IHBvaW50TGFiZWxQb3MoY29vcmRpbmF0ZXMpO1xuICAgICAgICAgIH0gZWxzZSBpZiAobC5mZWF0dXJlLmdlb21ldHJ5LnR5cGUgPT09ICdMaW5lU3RyaW5nJykge1xuICAgICAgICAgICAgbGFiZWxQb3MgPSBwb2x5bGluZUxhYmVsUG9zKGNvb3JkaW5hdGVzKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGwuZmVhdHVyZS5nZW9tZXRyeS50eXBlID09PSAnTXVsdGlMaW5lU3RyaW5nJykge1xuICAgICAgICAgICAgbGFiZWxQb3MgPSBwb2x5bGluZUxhYmVsUG9zKGNvb3JkaW5hdGVzW01hdGgucm91bmQoY29vcmRpbmF0ZXMubGVuZ3RoIC8gMildKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGFiZWxQb3MgPSBwb2x5Z29uTGFiZWxQb3MobCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdmFyIGxhYmVsID0gbGFiZWxNYXJrZXIobGFiZWxQb3MucG9zaXRpb24sIHtcbiAgICAgICAgICAgIHpJbmRleE9mZnNldDogMSxcbiAgICAgICAgICAgIHByb3BlcnRpZXM6IGdlb2pzb24ucHJvcGVydGllcyxcbiAgICAgICAgICAgIGxhYmVsaW5nSW5mbzogbGFiZWxpbmdJbmZvLFxuICAgICAgICAgICAgb2Zmc2V0OiBsYWJlbFBvcy5vZmZzZXQsXG4gICAgICAgICAgICBwYW5lOiBsYWJlbFBhbmVOYW1lXG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBsYWJlbHNMYXllci5hZGRMYXllcihsYWJlbCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGx5ciA9IEwubGF5ZXJHcm91cChba21sLCBsYWJlbHNMYXllcl0pO1xuXG4gICAgbGF5ZXJzLnB1c2goeyB0eXBlOiAnS01MJywgdGl0bGU6IGxheWVyLnRpdGxlIHx8ICcnLCBsYXllcjogbHlyIH0pO1xuXG4gICAgcmV0dXJuIGx5cjtcbiAgfSBlbHNlIGlmIChsYXllci5sYXllclR5cGUgPT09ICdBcmNHSVNJbWFnZVNlcnZpY2VMYXllcicpIHtcbiAgICBjb25zb2xlLmxvZygnY3JlYXRlIEFyY0dJU0ltYWdlU2VydmljZUxheWVyJyk7XG4gICAgbHlyID0gTC5lc3JpLmltYWdlTWFwTGF5ZXIoe1xuICAgICAgdXJsOiBsYXllci51cmwsXG4gICAgICB0b2tlbjogcGFyYW1zLnRva2VuIHx8IG51bGwsXG4gICAgICBwYW5lOiBwYW5lTmFtZSxcbiAgICAgIG9wYWNpdHk6IGxheWVyLm9wYWNpdHkgfHwgMVxuICAgIH0pO1xuXG4gICAgbGF5ZXJzLnB1c2goeyB0eXBlOiAnSU1MJywgdGl0bGU6IGxheWVyLnRpdGxlIHx8ICcnLCBsYXllcjogbHlyIH0pO1xuXG4gICAgcmV0dXJuIGx5cjtcbiAgfSBlbHNlIGlmIChsYXllci5sYXllclR5cGUgPT09ICdBcmNHSVNNYXBTZXJ2aWNlTGF5ZXInKSB7XG4gICAgbHlyID0gTC5lc3JpLmR5bmFtaWNNYXBMYXllcih7XG4gICAgICB1cmw6IGxheWVyLnVybCxcbiAgICAgIHRva2VuOiBwYXJhbXMudG9rZW4gfHwgbnVsbCxcbiAgICAgIHBhbmU6IHBhbmVOYW1lLFxuICAgICAgb3BhY2l0eTogbGF5ZXIub3BhY2l0eSB8fCAxXG4gICAgfSk7XG5cbiAgICBsYXllcnMucHVzaCh7IHR5cGU6ICdETUwnLCB0aXRsZTogbGF5ZXIudGl0bGUgfHwgJycsIGxheWVyOiBseXIgfSk7XG5cbiAgICByZXR1cm4gbHlyO1xuICB9IGVsc2UgaWYgKGxheWVyLmxheWVyVHlwZSA9PT0gJ0FyY0dJU1RpbGVkTWFwU2VydmljZUxheWVyJykge1xuICAgIHRyeSB7XG4gICAgICBseXIgPSBMLmVzcmkuYmFzZW1hcExheWVyKGxheWVyLnRpdGxlKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBseXIgPSBMLmVzcmkudGlsZWRNYXBMYXllcih7XG4gICAgICAgIHVybDogbGF5ZXIudXJsLFxuICAgICAgICB0b2tlbjogcGFyYW1zLnRva2VuIHx8IG51bGxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAobWFwLm9wdGlvbnMuYXR0cmlidXRpb25Db250cm9sICYmIG1hcC5hdHRyaWJ1dGlvbkNvbnRyb2wpIHtcbiAgICAgICAgTC5lc3JpLnJlcXVlc3QobGF5ZXIudXJsLCB7fSwgZnVuY3Rpb24gKGVyciwgcmVzKSB7XG4gICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgY29uc29sZS5sb2coZXJyKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIG1heFdpZHRoID0gKG1hcC5nZXRTaXplKCkueCAtIDU1KTtcbiAgICAgICAgICAgIHZhciB0aWxlZEF0dHJpYnV0aW9uID0gJzxzcGFuIGNsYXNzPVwiZXNyaS1hdHRyaWJ1dGlvbnNcIiBzdHlsZT1cImxpbmUtaGVpZ2h0OjE0cHg7IHZlcnRpY2FsLWFsaWduOiAtM3B4OyB0ZXh0LW92ZXJmbG93OmVsbGlwc2lzOyB3aGl0ZS1zcGFjZTpub3dyYXA7IG92ZXJmbG93OmhpZGRlbjsgZGlzcGxheTppbmxpbmUtYmxvY2s7IG1heC13aWR0aDonICsgbWF4V2lkdGggKyAncHg7XCI+JyArIHJlcy5jb3B5cmlnaHRUZXh0ICsgJzwvc3Bhbj4nO1xuICAgICAgICAgICAgbWFwLmF0dHJpYnV0aW9uQ29udHJvbC5hZGRBdHRyaWJ1dGlvbih0aWxlZEF0dHJpYnV0aW9uKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUoJ2xlYWZsZXQtdGlsZS1wYW5lJylbMF0uc3R5bGUub3BhY2l0eSA9IGxheWVyLm9wYWNpdHkgfHwgMTtcblxuICAgIGxheWVycy5wdXNoKHsgdHlwZTogJ1RNTCcsIHRpdGxlOiBsYXllci50aXRsZSB8fCAnJywgbGF5ZXI6IGx5ciB9KTtcblxuICAgIHJldHVybiBseXI7XG4gIH0gZWxzZSBpZiAobGF5ZXIubGF5ZXJUeXBlID09PSAnVmVjdG9yVGlsZUxheWVyJykge1xuICAgIHZhciBrZXlzID0ge1xuICAgICAgJ1dvcmxkIFN0cmVldCBNYXAgKHdpdGggUmVsaWVmKSc6ICdTdHJlZXRzUmVsaWVmJyxcbiAgICAgICdXb3JsZCBTdHJlZXQgTWFwICh3aXRoIFJlbGllZikgKE1hdHVyZSBTdXBwb3J0KSc6ICdTdHJlZXRzUmVsaWVmJyxcbiAgICAgICdIeWJyaWQgUmVmZXJlbmNlIExheWVyJzogJ0h5YnJpZCcsXG4gICAgICAnSHlicmlkIFJlZmVyZW5jZSBMYXllciAoTWF0dXJlIFN1cHBvcnQpJzogJ0h5YnJpZCcsXG4gICAgICAnV29ybGQgU3RyZWV0IE1hcCc6ICdTdHJlZXRzJyxcbiAgICAgICdXb3JsZCBTdHJlZXQgTWFwIChNYXR1cmUgU3VwcG9ydCknOiAnU3RyZWV0cycsXG4gICAgICAnV29ybGQgU3RyZWV0IE1hcCAoTmlnaHQpJzogJ1N0cmVldHNOaWdodCcsXG4gICAgICAnV29ybGQgU3RyZWV0IE1hcCAoTmlnaHQpIChNYXR1cmUgU3VwcG9ydCknOiAnU3RyZWV0c05pZ2h0JyxcbiAgICAgICdEYXJrIEdyYXkgQ2FudmFzJzogJ0RhcmtHcmF5JyxcbiAgICAgICdEYXJrIEdyYXkgQ2FudmFzIChNYXR1cmUgU3VwcG9ydCknOiAnRGFya0dyYXknLFxuICAgICAgJ1dvcmxkIFRvcG9ncmFwaGljIE1hcCc6ICdUb3BvZ3JhcGhpYycsXG4gICAgICAnV29ybGQgVG9wb2dyYXBoaWMgTWFwIChNYXR1cmUgU3VwcG9ydCknOiAnVG9wb2dyYXBoaWMnLFxuICAgICAgJ1dvcmxkIE5hdmlnYXRpb24gTWFwJzogJ05hdmlnYXRpb24nLFxuICAgICAgJ1dvcmxkIE5hdmlnYXRpb24gTWFwIChNYXR1cmUgU3VwcG9ydCknOiAnTmF2aWdhdGlvbicsXG4gICAgICAnTGlnaHQgR3JheSBDYW52YXMnOiAnR3JheScsXG4gICAgICAnTGlnaHQgR3JheSBDYW52YXMgKE1hdHVyZSBTdXBwb3J0KSc6ICdHcmF5J1xuICAgICAgLy8nVGVycmFpbiB3aXRoIExhYmVscyc6ICcnLFxuICAgICAgLy8nV29ybGQgVGVycmFpbiB3aXRoIExhYmVscyc6ICcnLFxuICAgICAgLy8nTGlnaHQgR3JheSBDYW52YXMgUmVmZXJlbmNlJzogJycsXG4gICAgICAvLydEYXJrIEdyYXkgQ2FudmFzIFJlZmVyZW5jZSc6ICcnLFxuICAgICAgLy8nRGFyayBHcmF5IENhbnZhcyBCYXNlJzogJycsXG4gICAgICAvLydMaWdodCBHcmF5IENhbnZhcyBCYXNlJzogJydcbiAgICB9O1xuXG4gICAgaWYgKGtleXNbbGF5ZXIudGl0bGVdKSB7XG4gICAgICBseXIgPSBMLmVzcmkuVmVjdG9yLmJhc2VtYXAoa2V5c1tsYXllci50aXRsZV0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdVbnN1cHBvcnRlZCBWZWN0b3IgVGlsZSBMYXllcjogJywgbGF5ZXIpO1xuICAgICAgbHlyID0gTC5mZWF0dXJlR3JvdXAoW10pO1xuICAgIH1cblxuICAgIGxheWVycy5wdXNoKHsgdHlwZTogJ1ZUTCcsIHRpdGxlOiBsYXllci50aXRsZSB8fCBsYXllci5pZCB8fCAnJywgbGF5ZXI6IGx5ciB9KTtcblxuICAgIHJldHVybiBseXI7XG4gIH0gZWxzZSBpZiAobGF5ZXIubGF5ZXJUeXBlID09PSAnT3BlblN0cmVldE1hcCcpIHtcbiAgICBseXIgPSBMLnRpbGVMYXllcignaHR0cDovL3tzfS50aWxlLm9zbS5vcmcve3p9L3t4fS97eX0ucG5nJywge1xuICAgICAgYXR0cmlidXRpb246ICcmY29weTsgPGEgaHJlZj1cImh0dHA6Ly9vc20ub3JnL2NvcHlyaWdodFwiPk9wZW5TdHJlZXRNYXA8L2E+IGNvbnRyaWJ1dG9ycydcbiAgICB9KTtcblxuICAgIGxheWVycy5wdXNoKHsgdHlwZTogJ1RMJywgdGl0bGU6IGxheWVyLnRpdGxlIHx8IGxheWVyLmlkIHx8ICcnLCBsYXllcjogbHlyIH0pO1xuXG4gICAgcmV0dXJuIGx5cjtcbiAgfSBlbHNlIGlmIChsYXllci5sYXllclR5cGUgPT09ICdXZWJUaWxlZExheWVyJykge1xuICAgIHZhciBseXJVcmwgPSBfZXNyaVdUTFVybFRlbXBsYXRlVG9MZWFmbGV0KGxheWVyLnRlbXBsYXRlVXJsKTtcbiAgICBseXIgPSBMLnRpbGVMYXllcihseXJVcmwsIHtcbiAgICAgIGF0dHJpYnV0aW9uOiBsYXllci5jb3B5cmlnaHRcbiAgICB9KTtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdsZWFmbGV0LXRpbGUtcGFuZScpWzBdLnN0eWxlLm9wYWNpdHkgPSBsYXllci5vcGFjaXR5IHx8IDE7XG5cbiAgICBsYXllcnMucHVzaCh7IHR5cGU6ICdUTCcsIHRpdGxlOiBsYXllci50aXRsZSB8fCBsYXllci5pZCB8fCAnJywgbGF5ZXI6IGx5ciB9KTtcblxuICAgIHJldHVybiBseXI7XG4gIH0gZWxzZSBpZiAobGF5ZXIubGF5ZXJUeXBlID09PSAnV01TJykge1xuICAgIHZhciBsYXllck5hbWVzID0gJyc7XG4gICAgZm9yIChpID0gMCwgbGVuID0gbGF5ZXIudmlzaWJsZUxheWVycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgbGF5ZXJOYW1lcyArPSBsYXllci52aXNpYmxlTGF5ZXJzW2ldO1xuICAgICAgaWYgKGkgPCBsZW4gLSAxKSB7XG4gICAgICAgIGxheWVyTmFtZXMgKz0gJywnO1xuICAgICAgfVxuICAgIH1cblxuICAgIGx5ciA9IEwudGlsZUxheWVyLndtcyhsYXllci51cmwsIHtcbiAgICAgIGxheWVyczogU3RyaW5nKGxheWVyTmFtZXMpLFxuICAgICAgZm9ybWF0OiAnaW1hZ2UvcG5nJyxcbiAgICAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgICAgYXR0cmlidXRpb246IGxheWVyLmNvcHlyaWdodFxuICAgIH0pO1xuXG4gICAgbGF5ZXJzLnB1c2goeyB0eXBlOiAnV01TJywgdGl0bGU6IGxheWVyLnRpdGxlIHx8IGxheWVyLmlkIHx8ICcnLCBsYXllcjogbHlyIH0pO1xuXG4gICAgcmV0dXJuIGx5cjtcbiAgfSBlbHNlIHtcbiAgICBseXIgPSBMLmZlYXR1cmVHcm91cChbXSk7XG4gICAgY29uc29sZS5sb2coJ1Vuc3VwcG9ydGVkIExheWVyOiAnLCBsYXllcik7XG4gICAgcmV0dXJuIGx5cjtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gX2VzcmlXVExVcmxUZW1wbGF0ZVRvTGVhZmxldCAodXJsKSB7XG4gIHZhciBuZXdVcmwgPSB1cmw7XG5cbiAgbmV3VXJsID0gbmV3VXJsLnJlcGxhY2UoL1xce2xldmVsfS9nLCAne3p9Jyk7XG4gIG5ld1VybCA9IG5ld1VybC5yZXBsYWNlKC9cXHtjb2x9L2csICd7eH0nKTtcbiAgbmV3VXJsID0gbmV3VXJsLnJlcGxhY2UoL1xce3Jvd30vZywgJ3t5fScpO1xuXG4gIHJldHVybiBuZXdVcmw7XG59XG5cbmV4cG9ydCB2YXIgT3BlcmF0aW9uYWxMYXllciA9IHtcbiAgb3BlcmF0aW9uYWxMYXllcjogb3BlcmF0aW9uYWxMYXllcixcbiAgX2dlbmVyYXRlRXNyaUxheWVyOiBfZ2VuZXJhdGVFc3JpTGF5ZXIsXG4gIF9lc3JpV1RMVXJsVGVtcGxhdGVUb0xlYWZsZXQ6IF9lc3JpV1RMVXJsVGVtcGxhdGVUb0xlYWZsZXRcbn07XG5cbmV4cG9ydCBkZWZhdWx0IE9wZXJhdGlvbmFsTGF5ZXI7XG4iLCIvKlxuICogTC5lc3JpLldlYk1hcFxuICogQSBsZWFmbGV0IHBsdWdpbiB0byBkaXNwbGF5IEFyY0dJUyBXZWIgTWFwLiBodHRwczovL2dpdGh1Yi5jb20veW51bm9rYXdhL0wuZXNyaS5XZWJNYXBcbiAqIChjKSAyMDE2IFl1c3VrZSBOdW5va2F3YVxuICpcbiAqIEBleGFtcGxlXG4gKlxuICogYGBganNcbiAqIHZhciB3ZWJtYXAgPSBMLndlYm1hcCgnMjJjNTA0ZDIyOWYxNGM3ODljNWI0OWViZmYzOGI5NDEnLCB7IG1hcDogTC5tYXAoJ21hcCcpIH0pO1xuICogYGBgXG4gKi9cblxuaW1wb3J0IHsgdmVyc2lvbiB9IGZyb20gJy4uL3BhY2thZ2UuanNvbic7XG5cbmltcG9ydCBMIGZyb20gJ2xlYWZsZXQnO1xuaW1wb3J0IHsgb3BlcmF0aW9uYWxMYXllciB9IGZyb20gJy4vT3BlcmF0aW9uYWxMYXllcic7XG5cbmV4cG9ydCB2YXIgV2ViTWFwID0gTC5FdmVudGVkLmV4dGVuZCh7XG4gIG9wdGlvbnM6IHtcbiAgICAvLyBMLk1hcFxuICAgIG1hcDoge30sXG4gICAgLy8gYWNjZXNzIHRva2VuIGZvciBzZWN1cmUgY29udGVudHMgb24gQXJjR0lTIE9ubGluZVxuICAgIHRva2VuOiBudWxsLFxuICAgIC8vIHNlcnZlciBkb21haW4gbmFtZSAoZGVmYXVsdD0gJ3d3dy5hcmNnaXMuY29tJylcbiAgICBzZXJ2ZXI6ICd3d3cuYXJjZ2lzLmNvbSdcbiAgfSxcblxuICBpbml0aWFsaXplOiBmdW5jdGlvbiAod2VibWFwSWQsIG9wdGlvbnMpIHtcbiAgICBMLnNldE9wdGlvbnModGhpcywgb3B0aW9ucyk7XG5cbiAgICB0aGlzLl9tYXAgPSB0aGlzLm9wdGlvbnMubWFwO1xuICAgIHRoaXMuX3Rva2VuID0gdGhpcy5vcHRpb25zLnRva2VuO1xuICAgIHRoaXMuX3NlcnZlciA9IHRoaXMub3B0aW9ucy5zZXJ2ZXI7XG4gICAgdGhpcy5fd2VibWFwSWQgPSB3ZWJtYXBJZDtcbiAgICB0aGlzLl9sb2FkZWQgPSBmYWxzZTtcbiAgICB0aGlzLl9tZXRhZGF0YUxvYWRlZCA9IGZhbHNlO1xuICAgIHRoaXMuX2xvYWRlZExheWVyc051bSA9IDA7XG4gICAgdGhpcy5fbGF5ZXJzTnVtID0gMDtcblxuICAgIHRoaXMubGF5ZXJzID0gW107IC8vIENoZWNrIHRoZSBsYXllciB0eXBlcyBoZXJlIC0+IGh0dHBzOi8vZ2l0aHViLmNvbS95bnVub2thd2EvTC5lc3JpLldlYk1hcC93aWtpL0xheWVyLXR5cGVzXG4gICAgdGhpcy50aXRsZSA9ICcnOyAvLyBXZWIgTWFwIFRpdGxlXG4gICAgdGhpcy5ib29rbWFya3MgPSBbXTsgLy8gV2ViIE1hcCBCb29rbWFya3MgLT4gW3sgbmFtZTogJ0Jvb2ttYXJrIG5hbWUnLCBib3VuZHM6IDxMLmxhdExuZ0JvdW5kcz4gfV1cbiAgICB0aGlzLnBvcnRhbEl0ZW0gPSB7fTsgLy8gV2ViIE1hcCBNZXRhZGF0YVxuXG4gICAgdGhpcy5WRVJTSU9OID0gdmVyc2lvbjtcblxuICAgIHRoaXMuX2xvYWRXZWJNYXBNZXRhRGF0YSh3ZWJtYXBJZCk7XG4gICAgdGhpcy5fbG9hZFdlYk1hcCh3ZWJtYXBJZCk7XG4gIH0sXG5cbiAgX2NoZWNrTG9hZGVkOiBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5fbG9hZGVkTGF5ZXJzTnVtKys7XG4gICAgaWYgKHRoaXMuX2xvYWRlZExheWVyc051bSA9PT0gdGhpcy5fbGF5ZXJzTnVtKSB7XG4gICAgICB0aGlzLl9sb2FkZWQgPSB0cnVlO1xuICAgICAgdGhpcy5maXJlKCdsb2FkJyk7XG4gICAgfVxuICB9LFxuXG4gIF9vcGVyYXRpb25hbExheWVyOiBmdW5jdGlvbiAobGF5ZXIsIGxheWVycywgbWFwLCBwYXJhbXMsIHBhbmVOYW1lKSB7XG4gICAgdmFyIGx5ciA9IG9wZXJhdGlvbmFsTGF5ZXIobGF5ZXIsIGxheWVycywgbWFwLCBwYXJhbXMpO1xuICAgIGlmIChseXIgIT09IHVuZGVmaW5lZCAmJiBsYXllci52aXNpYmlsaXR5ID09PSB0cnVlKSB7XG4gICAgICBseXIuYWRkVG8obWFwKTtcbiAgICB9XG4gIH0sXG5cbiAgX2xvYWRXZWJNYXBNZXRhRGF0YTogZnVuY3Rpb24gKGlkKSB7XG4gICAgdmFyIHBhcmFtcyA9IHt9O1xuICAgIHZhciBtYXAgPSB0aGlzLl9tYXA7XG4gICAgdmFyIHdlYm1hcCA9IHRoaXM7XG4gICAgdmFyIHdlYm1hcE1ldGFEYXRhUmVxdWVzdFVybCA9ICdodHRwczovLycgKyB0aGlzLl9zZXJ2ZXIgKyAnL3NoYXJpbmcvcmVzdC9jb250ZW50L2l0ZW1zLycgKyBpZDtcbiAgICBpZiAodGhpcy5fdG9rZW4gJiYgdGhpcy5fdG9rZW4ubGVuZ3RoID4gMCkge1xuICAgICAgcGFyYW1zLnRva2VuID0gdGhpcy5fdG9rZW47XG4gICAgfVxuXG4gICAgTC5lc3JpLnJlcXVlc3Qod2VibWFwTWV0YURhdGFSZXF1ZXN0VXJsLCBwYXJhbXMsIGZ1bmN0aW9uIChlcnJvciwgcmVzcG9uc2UpIHtcbiAgICAgIGlmIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmxvZyhlcnJvcik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZygnV2ViTWFwIE1ldGFEYXRhOiAnLCByZXNwb25zZSk7XG4gICAgICAgIHdlYm1hcC5wb3J0YWxJdGVtID0gcmVzcG9uc2U7XG4gICAgICAgIHdlYm1hcC50aXRsZSA9IHJlc3BvbnNlLnRpdGxlO1xuICAgICAgICB3ZWJtYXAuX21ldGFkYXRhTG9hZGVkID0gdHJ1ZTtcbiAgICAgICAgd2VibWFwLmZpcmUoJ21ldGFkYXRhTG9hZCcpO1xuICAgICAgICBtYXAuZml0Qm91bmRzKFtyZXNwb25zZS5leHRlbnRbMF0ucmV2ZXJzZSgpLCByZXNwb25zZS5leHRlbnRbMV0ucmV2ZXJzZSgpXSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0sXG5cbiAgX2xvYWRXZWJNYXA6IGZ1bmN0aW9uIChpZCkge1xuICAgIHZhciBtYXAgPSB0aGlzLl9tYXA7XG4gICAgdmFyIGxheWVycyA9IHRoaXMubGF5ZXJzO1xuICAgIHZhciBzZXJ2ZXIgPSB0aGlzLl9zZXJ2ZXI7XG4gICAgdmFyIHBhcmFtcyA9IHt9O1xuICAgIHZhciB3ZWJtYXBSZXF1ZXN0VXJsID0gJ2h0dHBzOi8vJyArIHNlcnZlciArICcvc2hhcmluZy9yZXN0L2NvbnRlbnQvaXRlbXMvJyArIGlkICsgJy9kYXRhJztcbiAgICBpZiAodGhpcy5fdG9rZW4gJiYgdGhpcy5fdG9rZW4ubGVuZ3RoID4gMCkge1xuICAgICAgcGFyYW1zLnRva2VuID0gdGhpcy5fdG9rZW47XG4gICAgfVxuXG4gICAgTC5lc3JpLnJlcXVlc3Qod2VibWFwUmVxdWVzdFVybCwgcGFyYW1zLCBmdW5jdGlvbiAoZXJyb3IsIHJlc3BvbnNlKSB7XG4gICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5sb2coZXJyb3IpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coJ1dlYk1hcDogJywgcmVzcG9uc2UpO1xuICAgICAgICB0aGlzLl9sYXllcnNOdW0gPSByZXNwb25zZS5iYXNlTWFwLmJhc2VNYXBMYXllcnMubGVuZ3RoICsgcmVzcG9uc2Uub3BlcmF0aW9uYWxMYXllcnMubGVuZ3RoO1xuXG4gICAgICAgIC8vIEFkZCBCYXNlbWFwXG4gICAgICAgIHJlc3BvbnNlLmJhc2VNYXAuYmFzZU1hcExheWVycy5tYXAoZnVuY3Rpb24gKGJhc2VNYXBMYXllcikge1xuICAgICAgICAgIGlmIChiYXNlTWFwTGF5ZXIuaXRlbUlkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHZhciBpdGVtUmVxdWVzdFVybCA9ICdodHRwczovLycgKyBzZXJ2ZXIgKyAnL3NoYXJpbmcvcmVzdC9jb250ZW50L2l0ZW1zLycgKyBiYXNlTWFwTGF5ZXIuaXRlbUlkO1xuICAgICAgICAgICAgTC5lc3JpLnJlcXVlc3QoaXRlbVJlcXVlc3RVcmwsIHBhcmFtcywgZnVuY3Rpb24gKGVyciwgcmVzKSB7XG4gICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhyZXMuYWNjZXNzKTtcbiAgICAgICAgICAgICAgICBpZiAocmVzLmFjY2VzcyAhPT0gJ3B1YmxpYycpIHtcbiAgICAgICAgICAgICAgICAgIHRoaXMuX29wZXJhdGlvbmFsTGF5ZXIoYmFzZU1hcExheWVyLCBsYXllcnMsIG1hcCwgcGFyYW1zKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgdGhpcy5fb3BlcmF0aW9uYWxMYXllcihiYXNlTWFwTGF5ZXIsIGxheWVycywgbWFwLCB7fSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHRoaXMuX2NoZWNrTG9hZGVkKCk7XG4gICAgICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fb3BlcmF0aW9uYWxMYXllcihiYXNlTWFwTGF5ZXIsIGxheWVycywgbWFwLCB7fSk7XG4gICAgICAgICAgICB0aGlzLl9jaGVja0xvYWRlZCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfS5iaW5kKHRoaXMpKTtcblxuICAgICAgICAvLyBBZGQgT3BlcmF0aW9uYWwgTGF5ZXJzXG4gICAgICAgIHJlc3BvbnNlLm9wZXJhdGlvbmFsTGF5ZXJzLm1hcChmdW5jdGlvbiAobGF5ZXIsIGkpIHtcbiAgICAgICAgICB2YXIgcGFuZU5hbWUgPSAnZXNyaS13ZWJtYXAtbGF5ZXInICsgaTtcbiAgICAgICAgICBtYXAuY3JlYXRlUGFuZShwYW5lTmFtZSk7XG4gICAgICAgICAgaWYgKGxheWVyLml0ZW1JZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB2YXIgaXRlbVJlcXVlc3RVcmwgPSAnaHR0cHM6Ly8nICsgc2VydmVyICsgJy9zaGFyaW5nL3Jlc3QvY29udGVudC9pdGVtcy8nICsgbGF5ZXIuaXRlbUlkO1xuICAgICAgICAgICAgTC5lc3JpLnJlcXVlc3QoaXRlbVJlcXVlc3RVcmwsIHBhcmFtcywgZnVuY3Rpb24gKGVyciwgcmVzKSB7XG4gICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhyZXMuYWNjZXNzKTtcbiAgICAgICAgICAgICAgICBpZiAocmVzLmFjY2VzcyAhPT0gJ3B1YmxpYycpIHtcbiAgICAgICAgICAgICAgICAgIHRoaXMuX29wZXJhdGlvbmFsTGF5ZXIobGF5ZXIsIGxheWVycywgbWFwLCBwYXJhbXMsIHBhbmVOYW1lKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgdGhpcy5fb3BlcmF0aW9uYWxMYXllcihsYXllciwgbGF5ZXJzLCBtYXAsIHt9LCBwYW5lTmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHRoaXMuX2NoZWNrTG9hZGVkKCk7XG4gICAgICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fb3BlcmF0aW9uYWxMYXllcihsYXllciwgbGF5ZXJzLCBtYXAsIHt9LCBwYW5lTmFtZSk7XG4gICAgICAgICAgICB0aGlzLl9jaGVja0xvYWRlZCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfS5iaW5kKHRoaXMpKTtcblxuICAgICAgICAvLyBBZGQgQm9va21hcmtzXG4gICAgICAgIGlmIChyZXNwb25zZS5ib29rbWFya3MgIT09IHVuZGVmaW5lZCAmJiByZXNwb25zZS5ib29rbWFya3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHJlc3BvbnNlLmJvb2ttYXJrcy5tYXAoZnVuY3Rpb24gKGJvb2ttYXJrKSB7XG4gICAgICAgICAgICAvLyBFc3JpIEV4dGVudCBHZW9tZXRyeSB0byBMLmxhdExuZ0JvdW5kc1xuICAgICAgICAgICAgdmFyIG5vcnRoRWFzdCA9IEwuUHJvamVjdGlvbi5TcGhlcmljYWxNZXJjYXRvci51bnByb2plY3QoTC5wb2ludChib29rbWFyay5leHRlbnQueG1heCwgYm9va21hcmsuZXh0ZW50LnltYXgpKTtcbiAgICAgICAgICAgIHZhciBzb3V0aFdlc3QgPSBMLlByb2plY3Rpb24uU3BoZXJpY2FsTWVyY2F0b3IudW5wcm9qZWN0KEwucG9pbnQoYm9va21hcmsuZXh0ZW50LnhtaW4sIGJvb2ttYXJrLmV4dGVudC55bWluKSk7XG4gICAgICAgICAgICB2YXIgYm91bmRzID0gTC5sYXRMbmdCb3VuZHMoc291dGhXZXN0LCBub3J0aEVhc3QpO1xuICAgICAgICAgICAgdGhpcy5ib29rbWFya3MucHVzaCh7IG5hbWU6IGJvb2ttYXJrLm5hbWUsIGJvdW5kczogYm91bmRzIH0pO1xuICAgICAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICAgIH1cblxuICAgICAgICAvL3RoaXMuX2xvYWRlZCA9IHRydWU7XG4gICAgICAgIC8vdGhpcy5maXJlKCdsb2FkJyk7XG4gICAgICB9XG4gICAgfS5iaW5kKHRoaXMpKTtcbiAgfVxufSk7XG5cbmV4cG9ydCBmdW5jdGlvbiB3ZWJNYXAgKHdlYm1hcElkLCBvcHRpb25zKSB7XG4gIHJldHVybiBuZXcgV2ViTWFwKHdlYm1hcElkLCBvcHRpb25zKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgd2ViTWFwO1xuIl0sIm5hbWVzIjpbIlJlbmRlcmVyIl0sIm1hcHBpbmdz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Q0FBQztBQUNsRixDQUFBLEVBQUUsSUFBSSxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDbEYsQ0FBQSxFQUFFLElBQUksRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDOztBQUVqRixDQUFBLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxFQUFFO0FBQ2hCLENBQUEsSUFBSSxJQUFJLEVBQUUsR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQ3RCLENBQUEsSUFBSSxJQUFJLEVBQUUsR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDOztBQUV0QixDQUFBLElBQUksSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFO0FBQ2xELENBQUEsTUFBTSxPQUFPLElBQUksQ0FBQztBQUNsQixDQUFBLEtBQUs7QUFDTCxDQUFBLEdBQUc7O0FBRUgsQ0FBQSxFQUFFLE9BQU8sS0FBSyxDQUFDO0FBQ2YsQ0FBQSxDQUFD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Q0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2hELENBQUEsUUFBUSxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztBQUNyQyxDQUFBLE9BQU87QUFDUCxDQUFBLEtBQUssQ0FBQyxDQUFDOztBQUVQLENBQUEsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQztBQUNsQixDQUFBLE1BQU0sa0JBQWtCLEVBQUUsVUFBVSxLQUFLLEVBQUU7QUFDM0MsQ0FBQSxRQUFRLElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7QUFDbEMsQ0FBQSxRQUFRLElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDOztBQUV2QyxDQUFBLFFBQVEsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRTtBQUMzQixDQUFBLFVBQVUsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO0FBQzFCLENBQUEsVUFBVSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUN0QyxDQUFBLFNBQVM7O0FBRVQsQ0FBQSxRQUFRLElBQUksR0FBRyxHQUFHLEdBQUcsR0FBRyxNQUFNLENBQUMsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDO0FBQzVELENBQUEsVUFBVSxHQUFHLEdBQUcsTUFBTSxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQztBQUNwRCxDQUFBLFVBQVUsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxHQUFHLEdBQUcsTUFBTSxDQUFDLENBQUM7QUFDcEQsQ0FBQSxVQUFVLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsR0FB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LENBQUM7O0FBRXhCLENBQUEsUUFBUSxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztBQUNyQyxDQUFBLE9BQU87QUFDUCxDQUFBLEtBQUssQ0FBQyxDQUFDOztBQUVQLENBQUEsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQztBQUNsQixDQUFBLE1BQU0sbUJBQW1CLEVBQUUsVUFBVSxLQUFLLEVBQUU7QUFDNUMsQ0FBQSxRQUFRLElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7QUFDbEMsQ0FBQSxRQUFRLElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDOztBQUV2QyxDQUFBLFFBQVEsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRTtBQUMzQixDQUFBLFVBQVUsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO0FBQzFCLENBQUEsVUFBVSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUN0QyxDQUFBLFNBQVM7O0FBRVQsQ0FBQSxRQUFRLElBQUksR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUM7QUFDdkUsQ0FBQSxVQUFVLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUM7QUFDL0QsQ0FBQSxVQUFVLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUM7QUFDL0QsQ0FBQSxVQUFVLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsR0FBRyxH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R0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDO0FBQ2xDLENBQUEsUUFBUSxJQUFJLE1BQU0sR0FBRyxLQUFLLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQzs7QUFFdkMsQ0FBQSxRQUFRLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUU7QUFDM0IsQ0FBQSxVQUFVLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQUMxQixDQUFBLFVBQVUsTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDdEMsQ0FBQSxTQUFTOztBQUVULENBQUEsUUFBUSxJQUFJLEdBQUcsR0FBRyxHQUFHLEdBQUcsTUFBTSxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQztBQUM1RCxDQUFBLFVBQVUsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxHQUFHLEdBQUcsTUFBTSxDQUFDLENBQUM7QUFDcEQsQ0FBQSxVQUFVLEdBQUcsR0FBRyxNQUFNLENBQUMsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDO0FBQ3BELENBQUEsVUFBVSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxHQUFHLEdBQUcsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDOztBQUVyRCxDQUFBLFFBQVEsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQzs7QUFFaEQsQ0FBQSxRQUFRLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0FBQ2xDLENBQUEsT0FBTztBQUNQLENBQUEsS0FBSyxDQUFDLENBQUM7QUFDUCxDQUFBLEdBQUc7QUFDSCxDQUFBLENBQUMsQ0FBQyxDQUFDOztBQUVILEFBQU8sQ0FBQSxJQUFJ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SUFBSSxHQUFHLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDOUMsQ0FBQTtBQUNBLENBQUEsSUFBSSxJQUFJLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxJQUFJLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFO0FBQ3hFLENBQUEsTUFBTSxJQUFJLElBQUksR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDL0QsQ0FBQSxNQUFNLElBQUksSUFBSSxFQUFFO0FBQ2hCLENBQUEsUUFBUSxHQUFHLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDO0FBQ3hELENBQUEsUUFBUSxJQUFJLElBQUksR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDakUsQ0FBQSxRQUFRLElBQUksSUFBSSxFQUFFO0FBQ2xCLENBQUEsVUFBVSxHQUFHLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDO0FBQzFELENBQUEsU0FBUztBQUNULENBQUEsT0FBTztBQUNQLENBQUEsS0FBSzs7QUFFTCxDQUFBLElBQUksSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQztBQUNyQyxDQUFBLElBQUksS0FBSyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtBQUN4RCxDQUFBO0FBQ0EsQ0FBQTtBQUNBLENBQUE7QUFDQSxDQUFBLE1BQU0sSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFDdkMsQ0FBQSxRQUFRLE1BQU0sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2xDLENB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