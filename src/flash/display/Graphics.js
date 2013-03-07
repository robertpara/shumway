var GraphicsDefinition = (function () {
  var GRAPHICS_PATH_COMMAND_CUBIC_CURVE_TO = 6;
  var GRAPHICS_PATH_COMMAND_CURVE_TO       = 3;
  var GRAPHICS_PATH_COMMAND_LINE_TO        = 2;
  var GRAPHICS_PATH_COMMAND_MOVE_TO        = 1;
  var GRAPHICS_PATH_COMMAND_WIDE_LINE_TO   = 5;
  var GRAPHICS_PATH_COMMAND_WIDE_MOVE_TO   = 4;

  var GRAPHICS_PATH_WINDING_EVEN_ODD       = 'evenOdd';
  var GRAPHICS_PATH_WINDING_NON_ZERO       = 'nonZero';

  var fillContext = document.createElement('canvas').getContext('2d');

  function toRgba(color, alpha) {
    var red = color >> 16 & 0xFF;
    var green = color >> 8 & 0xFF;
    var blue = color & 0xFF;
    return 'rgba(' + red + ',' + green + ',' + blue + ',' + alpha + ')';
  }

  var def = {
    __class__: 'flash.display.Graphics',

    initialize: function () {
      this._bitmap = null;
      this._drawingStyles = null;
      this._fillStyle = null;
      this._revision = 0;
      this._scale = 1;
      this._strokeStyle = null;
      this._subpaths = [];
    },

    _cacheAsBitmap: function (bbox) {
      var bounds = this._getBounds();
      var canvas = document.createElement('canvas');
      canvas.width = bounds.width;
      canvas.height = bounds.height;
      var ctx = canvas.getContext('kanvas-2d');
      ctx.translate(-bbox.left, -bbox.top);
      var scale = this._scale;
      if (scale !== 1)
        ctx.scale(scale, scale);
      var subpaths = this._subpaths;
      for (var i = 0; i < subpaths.length; i++) {
        var path = subpaths[i];

        ctx.currentPath = path;

        var fill = path.fillStyle;
        if (fill) {
          ctx.fillStyle = fill;
          var m = fill.currentTransform;
          if (m) {
            ctx.save();
            ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
            ctx.fill();
            ctx.restore();
          } else {
            ctx.fill();
          }
        }
        if (path.strokeStyle) {
          ctx.strokeStyle = path.strokeStyle;
          var drawingStyles = path.drawingStyles;
          for (var prop in drawingStyles)
            ctx[prop] = drawingStyles[prop];
          ctx.stroke();
        }
      }
      this._bitmap = canvas;
    },
    _createLinearGradient: function (x0, y0, x1, y1) {
      return fillContext.createLinearGradient(x0, y0, x1, y1);
    },
    _createRadialGradient: function (x0, y0, r0, x1, y1, r1) {
      return fillContext.createRadialGradient(x0, y0, r0, x1, y1, r1);
    },
    _createPattern: function(image, repetition) {
      return fillContext.createPattern(image, repetition);
    },

    get _currentPath() {
      var path = new Kanvas.Path;
      path.drawingStyles = this._drawingStyles;
      path.fillStyle = this._fillStyle;
      path.strokeStyle = this._strokeStyle;
      this._subpaths.push(path);
      // Cache as an own property.
      Object.defineProperty(this, '_currentPath', describeProperty(path));
      return path;
    },

    beginFill: function (color, alpha) {
      if (alpha === undefined)
        alpha = 1;

      delete this._currentPath;

      this._fillStyle = alpha ? toRgba(color, alpha) : null;
    },
    beginGradientFill: function (type, colors, alphas, ratios, matrix, spreadMethod, interpolationMethod, focalPos) {
      var gradient;
      if (type === 'linear')
        gradient = this._createLinearGradient(-1, 0, 1, 0);
      else if (type == 'radial')
        gradient = this._createRadialGradient((focalPos || 0), 0, 0, 0, 0, 1);
      else
        throw ArgumentError();

      for (var i = 0, n = colors.length; i < n; i++)
        gradient.addColorStop(ratios[i], toRgba(colors[i], alphas[i]));

      this._fillStyle = gradient;

      // NOTE firefox really sensitive to really small scale when painting gradients
      var scale = 819.2;
      gradient.currentTransform = matrix ?
        { a: scale * matrix.a, b: scale * matrix.b, c: scale * matrix.c, d: scale * matrix.d, tx: matrix.tx, ty: matrix.ty } :
        { a: scale, b: 0, c: 0, d: scale, tx: 0, ty: 0 };
    },
    beginBitmapFill: function (bitmap, matrix, repeat, smooth) {
      var repeatStyle = repeat ? 'repeat' : 'no-repeat';
      var pattern = this._createPattern(bitmap._drawable, repeatStyle);
      this._fillStyle = pattern;

      var scale = this._scale;
      pattern.currentTransform = matrix ?
        { a: scale * matrix.a, b: scale * matrix.b, c: scale * matrix.c, d: scale * matrix.d, tx: matrix.tx, ty: matrix.ty } :
        { a: scale, b: 0, c: 0, d: scale, tx: 0, ty: 0 };
    },
    clear: function () {
      delete this._currentPath;

      this._drawingStyles = null;
      this._fillStyle = null;
      this._strokeStyle = null;
      this._subpaths.length = 0;

      this._hitCtx.beginPath();
    },
    copyFrom: function (sourceGraphics) {
      notImplemented();
    },
    cubicCurveTo: function (cp1x, cp1y, cp2x, cp2y, x, y) {
      this._currentPath.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
      this._revision++;
    },
    curveTo: function (cpx, cpy, x, y) {
      this._currentPath.quadraticCurveTo(cpx, cpy, x, y);
      this._revision++;
    },
    drawPath: function (commands, data, winding) {
      delete this._currentPath;
      this._currentPath.fillRule = winding || GRAPHICS_PATH_WINDING_EVEN_ODD;

      for (var i = 0, j = 0, n = commands.length; i < n; i++) {
        switch (commands[i]) {
        case GRAPHICS_PATH_COMMAND_CUBIC_CURVE_TO:
          this.cubicCurveTo(data[j++], data[j++], data[j++], data[j++], data[j++], data[j++]);
          break;
        case GRAPHICS_PATH_COMMAND_CURVE_TO:
          this.curveTo(data[j++], data[j++], data[j++], data[j++]);
          break;
        case GRAPHICS_PATH_COMMAND_LINE_TO:
          this.lineTo(data[j++], data[j++]);
          break;
        case GRAPHICS_PATH_COMMAND_MOVE_TO:
          this.moveTo(data[j++], data[j++]);
          break;
        case GRAPHICS_PATH_COMMAND_WIDE_LINE_TO:
        case GRAPHICS_PATH_COMMAND_WIDE_MOVE_TO:
          this.curveTo(0, 0, data[j++], data[j++]);
          break;
        }
      }
    },
    drawRect: function (x, y, w, h) {
      if (isNaN(w + h))
        throw ArgumentError();

      this._currentPath.rect(x, y, w, h);
      this._revision++;
    },
    drawRoundRect: function (x, y, w, h, ellipseWidth, ellipseHeight) {
      if (isNaN(w + h + ellipseWidth) || (ellipseHeight !== undefined && isNaN(ellipseHeight)))
        throw ArgumentError();

      var radiusW = ellipseWidth / 2;
      var radiusH = ellipseHeight / 2;

      //    A-----B
      //  H         C
      //  G         D
      //    F-----E
      //
      // Through some testing, it has been discovered
      // tha the Flash player starts and stops the pen
      // at 'D', so we will too.

      this._currentPath.moveTo(x+w, y+h-radiusH);
      this._currentPath.arcTo(x+w, y+h, x+w-radiusW, y+h-radiusH, radiusW, radiusH);
      this._currentPath.arcTo(x, y+h, x, y+h-radiusH, radiusW, radiusH);
      this._currentPath.arcTo(x, y, x+radiusW, y, radiusW, radiusH);
      this._currentPath.arcTo(x+w, y, x+w, y+radiusH, radiusW, radiusH);
    },
    drawRoundRectComplex: function (x, y, w, h, topLeftRadius, topRightRadius, bottomLeftRadius, bottomRightRadius) {
      if (isNaN(w + h + topLeftRadius + topRightRadius + bottomLeftRadius + bottomRightRadius))
        throw ArgumentError();

      this._currentPath.moveTo(x+w, y+h-radiusH);
      this._currentPath.arcTo(x+w, y+h, x+w-bottomRightRadius, y+h-bottomRightRadius, bottomRightRadius);
      this._currentPath.arcTo(x, y+h, x, y+h-bottomLeftRadius, bottomLeftRadius);
      this._currentPath.arcTo(x, y, x+topLeftRadius, y, topLeftRadius);
      this._currentPath.arcTo(x+w, y, x+w, y+topRightRadius, topRightRadius);
    },
    drawTriangles: function (vertices, indices, uvtData, culling) {
      notImplemented();
    },
    endFill: function () {
      delete this._currentPath;

      this._fillStyle = null;
    },
    lineBitmapStyle: function (bitmap, matrix, repeat, smooth) {
      notImplemented();
    },
    lineGradientStyle: function (type, colors, alphas, ratios, matrix, spreadMethod, interpolationMethod, focalPos) {
      notImplemented();
    },

    lineStyle: function (width, color, alpha, pxHinting, scale, cap, joint, mlimit) {
      delete this._currentPath;

      if (width) {
        if (alpha === undefined)
          alpha = 1;
        if (mlimit === undefined)
          mlimit = 3;

        this._drawingStyles = {
          lineCap: cap || 'round',
          lineJoin: cap || 'round',
          lineWidth: width,
          miterLimit: mlimit * 2
        };
        this._strokeStyle = toRgba(color, alpha);
      } else {
        this._drawingStyles = null;
        this._strokeStyle = null;
      }
    },
    lineTo: function (x, y) {
      this._currentPath.lineTo(x, y);
      this._revision++;
    },
    moveTo: function (x, y) {
      this._currentPath.moveTo(x, y);
      this._revision++;
    },
    _getBounds: function (includeStroke) {
      var subpaths = this._subpaths;
      var xMins = [], yMins = [], xMaxs = [], yMaxs = [];
      for (var i = 0, n = subpaths.length; i < n; i++) {
        var path = subpaths[i];
        var b = path.getBoundingRect();
        xMins.push(b.left);
        yMins.push(b.top);
        xMaxs.push(b.right);
        yMaxs.push(b.bottom);
      }
      if (xMins.length === 0) {
        return 0;
      }
      var scale = this._scale;
      var xMin = Math.min.apply(Math, xMins) * scale;
      var yMin = Math.min.apply(Math, yMins) * scale;
      var xMax = Math.max.apply(Math, xMaxs) * scale;
      var yMax = Math.max.apply(Math, yMaxs) * scale;
      return { x: xMin, y: yMin, width: xMax - xMin, height: yMax - yMin};
    }
  };

  def.__glue__ = {
    native: {
      instance: {
        beginFill: def.beginFill,
        beginGradientFill: def.beginGradientFill,
        beginBitmapFill: def.beginBitmapFill,
        beginFillObject: def.beginFillObject,
        beginStrokeObject: def.beginStrokeObject,
        clear: def.clear,
        copyFrom: def.copyFrom,
        cubicCurveTo: def.cubicCurveTo,
        curveTo: def.curveTo,
        drawPath: def.drawPath,
        drawRect: def.drawRect,
        drawRoundRect: def.drawRoundRect,
        drawRoundRectComplex: def.drawRoundRectComplex,
        drawTriangles: def.drawTriangles,
        endFill: def.endFill,
        lineBitmapStyle: def.lineBitmapStyle,
        lineGradientStyle: def.lineGradientStyle,
        lineStyle: def.lineStyle,
        moveTo: def.moveTo,
        lineTo: def.lineTo
      }
    }
  };

  return def;
}).call(this);
