var sidebar = new ol.control.Sidebar({ element: 'sidebar', position: 'right' });
var jsonFiles, filesLength, fileKey = 0;

var projection = ol.proj.get('EPSG:3857');
var projectionExtent = projection.getExtent();
var size = ol.extent.getWidth(projectionExtent) / 256;
var resolutions = new Array(20);
var matrixIds = new Array(20);
for (var z = 0; z < 20; ++z) {
  // generate resolutions and matrixIds arrays for this WMTS
  resolutions[z] = size / Math.pow(2, z);
  matrixIds[z] = z;
}

var cityList = {};
var filterCity = '', filterTown = '';
var filterExtent = false;
var styleCache = {};
function pointStyle(feature) {
  var color = '#3399CC';
  var size = feature.get('features').length;
  var style = styleCache[size];
  if (!style) {
    style = [new ol.style.Style({
      image: new ol.style.Circle({
        radius: 20,
        stroke: new ol.style.Stroke({
          color: '#fff'
        }),
        fill: new ol.style.Fill({
          color: color
        })
      }),
      text: new ol.style.Text({
        text: size.toString(),
        fill: new ol.style.Fill({
          color: '#fff'
        })
      })
    })];
    styleCache[size] = style;
  }
  return style;
}
var sidebarTitle = document.getElementById('sidebarTitle');
var content = document.getElementById('infoBox');

var appView = new ol.View({
  center: ol.proj.fromLonLat([120.721507, 23.700694]),
  zoom: 9
});

var pointFormat = new ol.format.GeoJSON({
  featureProjection: appView.getProjection()
});

var vectorSource = new ol.source.Vector({
  format: pointFormat
});

var clusterSource = new ol.source.Cluster({
  distance: 40,
  source: vectorSource
});

var vectorPoints = new ol.layer.AnimatedCluster({
  source: clusterSource,
  style: pointStyle
});

var baseLayer = new ol.layer.Tile({
  source: new ol.source.WMTS({
    matrixSet: 'EPSG:3857',
    format: 'image/png',
    url: 'https://wmts.nlsc.gov.tw/wmts',
    layer: 'EMAP',
    tileGrid: new ol.tilegrid.WMTS({
      origin: ol.extent.getTopLeft(projectionExtent),
      resolutions: resolutions,
      matrixIds: matrixIds
    }),
    style: 'default',
    wrapX: true,
    attributions: '<a href="http://maps.nlsc.gov.tw/" target="_blank">國土測繪圖資服務雲</a>'
  }),
  opacity: 0.8
});

function countyStyle(f) {
  var p = f.getProperties();
  if (selectedCounty === p.COUNTYNAME) {
    return null;
  }
  var color = 'rgba(255,255,255,0.6)';
  var strokeWidth = 1;
  var strokeColor = 'rgba(0,0,0,0.3)';
  var cityKey = p.COUNTYNAME;
  var textColor = '#000000';
  var baseStyle = new ol.style.Style({
    stroke: new ol.style.Stroke({
      color: strokeColor,
      width: strokeWidth
    }),
    fill: new ol.style.Fill({
      color: color
    }),
    text: new ol.style.Text({
      font: '14px "Open Sans", "Arial Unicode MS", "sans-serif"',
      text: p.COUNTYNAME + "\n(請點選)",
      fill: new ol.style.Fill({
        color: textColor
      })
    })
  });
  return baseStyle;
}

var county = new ol.layer.Vector({
  source: new ol.source.Vector({
    url: 'https://kiang.github.io/taiwan_basecode/county/topo/20200820.json',
    format: new ol.format.TopoJSON({
      featureProjection: appView.getProjection()
    })
  }),
  style: countyStyle,
  zIndex: 50
});


var map = new ol.Map({
  layers: [baseLayer, county, vectorPoints],
  target: 'map',
  view: appView
});

map.addControl(sidebar);
var pointClicked = false;
var selectedCounty = '';
var pointsPool = {};
map.on('singleclick', function (evt) {
  content.innerHTML = '';
  pointClicked = false;
  map.forEachFeatureAtPixel(evt.pixel, function (feature, layer) {
    if (false === pointClicked) {
      pointClicked = true;
      var p = feature.getProperties();
      if (p.COUNTYNAME) {
        selectedCounty = p.COUNTYNAME;
        vectorSource.clear();
        if (!pointsPool[selectedCounty]) {
          $.getJSON('https://kiang.github.io/npa.gov.tw/json/' + selectedCounty + '.json', function (c) {
            pointsPool[selectedCounty] = c;
            vectorSource.addFeatures(pointFormat.readFeatures(pointsPool[selectedCounty]));
            vectorSource.refresh();
          });
        } else {
          vectorSource.addFeatures(pointFormat.readFeatures(pointsPool[selectedCounty]));
          vectorSource.refresh();
        }
        county.getSource().refresh();
      } else if (p.features) {
        if (p.features.length > 1) {
          var currentZoom = map.getView().getZoom();
          if (currentZoom < 15) {
            const extent = ol.extent.boundingExtent(
              p.features.map((r) => r.getGeometry().getCoordinates())
            );
            map.getView().fit(extent, { duration: 1000, padding: [50, 50, 50, 50] });
          }
        } else {
          currentFeature = feature;
          vectorPoints.getSource().refresh();

          var feature = p.features.pop();
          p = feature.getProperties();
          var lonLat = ol.proj.toLonLat(p.geometry.getCoordinates());
          var message = '<table class="table table-dark">';
          message += '<tbody>';
          for (k in p) {
            if (k !== 'geometry') {
              message += '<tr><th scope="row" style="width: 100px;">' + k + '</th><td>' + p[k] + '</td></tr>';
            }
          }
          message += '<tr><td colspan="2">';
          message += '<hr /><div class="btn-group-vertical" role="group" style="width: 100%;">';
          message += '<a href="https://www.google.com/maps/dir/?api=1&destination=' + lonLat[1] + ',' + lonLat[0] + '&travelmode=driving" target="_blank" class="btn btn-info btn-lg btn-block">Google 導航</a>';
          message += '<a href="https://wego.here.com/directions/drive/mylocation/' + lonLat[1] + ',' + lonLat[0] + '" target="_blank" class="btn btn-info btn-lg btn-block">Here WeGo 導航</a>';
          message += '<a href="https://bing.com/maps/default.aspx?rtp=~pos.' + lonLat[1] + '_' + lonLat[0] + '" target="_blank" class="btn btn-info btn-lg btn-block">Bing 導航</a>';
          message += '</div></td></tr>';
          message += '</tbody></table>';
          sidebarTitle.innerHTML = '防空疏散避難點';
          content.innerHTML = message;
          sidebar.open('home');
        }
      }
    }
  });
});

var selectCluster = new ol.interaction.SelectCluster({
  // Point radius: to calculate distance between the features
  pointRadius: 7,
  // circleMaxObjects: 40,
  // spiral: false,
  // autoClose: false,
  animate: true
});
map.addInteraction(selectCluster);

var previousFeature = false;
var currentFeature = false;

var geolocation = new ol.Geolocation({
  projection: appView.getProjection()
});

geolocation.setTracking(true);

geolocation.on('error', function (error) {
  console.log(error.message);
});

var positionFeature = new ol.Feature();

positionFeature.setStyle(new ol.style.Style({
  image: new ol.style.Circle({
    radius: 6,
    fill: new ol.style.Fill({
      color: '#3399CC'
    }),
    stroke: new ol.style.Stroke({
      color: '#fff',
      width: 2
    })
  })
}));

var firstPosDone = false;
geolocation.on('change:position', function () {
  var coordinates = geolocation.getPosition();
  positionFeature.setGeometry(coordinates ? new ol.geom.Point(coordinates) : null);
  if (false === firstPosDone) {
    map.dispatchEvent({
      type: 'singleclick',
      coordinate: coordinates,
      pixel: map.getPixelFromCoordinate(coordinates)
    });
    appView.setCenter(coordinates);
    firstPosDone = true;
  }
});

new ol.layer.Vector({
  map: map,
  source: new ol.source.Vector({
    features: [positionFeature]
  })
});

$('#btn-geolocation').click(function () {
  var coordinates = geolocation.getPosition();
  if (coordinates) {
    appView.setCenter(coordinates);
  } else {
    alert('目前使用的設備無法提供地理資訊');
  }
  return false;
});