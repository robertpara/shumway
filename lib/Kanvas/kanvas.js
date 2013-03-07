// Kanvas v0.0.0 (c) 2013 Tobias Schneider
// Released under MIT license.

// Kanvas adds support for not (yet) implemented HTML Canvas APIs.

;var Kanvas = Kanvas || (function (doc, undefined) {

  'use strict';

  /** @const */ var PATH_OP_CLOSE     = 0;
  /** @const */ var PATH_OP_MOVE      = 1;
  /** @const */ var PATH_OP_LINE      = 2;
  /** @const */ var PATH_OP_CURVE     = 3;
  /** @const */ var PATH_OP_BEZIER    = 4;
  /** @const */ var PATH_OP_ARCTO     = 5;
  /** @const */ var PATH_OP_RECT      = 6;
  /** @const */ var PATH_OP_ARC       = 7;
  /** @const */ var PATH_OP_ELLIPSE   = 8;
  /** @const */ var PATH_OP_TRANSFORM = 9;

  /** @const */ var PI                = Math.PI;
  /** @const */ var PI_DOUBLE         = PI * 2;
  /** @const */ var PI_HALF           = PI / 2;

  /** @const */ var SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

  var Kanvas = { version: '0.0.0' };

  var nativeCanvas = doc.createElement('canvas');
  var nativeCanvasClass = nativeCanvas.constructor;

  var native2dCtx = nativeCanvas.getContext('2d');
  var native2dCtxClass = native2dCtx.constructor;

  var nativeCanvasProto = nativeCanvasClass.prototype;
  var native2dCtxProto = native2dCtxClass.prototype;
  var kanvas2dCtxProto = Object.create(null);

  var nativePathClass = typeof Path === 'undefined' ? undefined : Path;
  var kanvasPathProto = Object.create(null);
  var kanvasPathMethods = Object.create(null);

  var shimCurrentTransform = !('currentTransform' in native2dCtx);
  var shimResetTransform = !('resetTransform' in native2dCtx);
  var shimEllipticalArcTo = false;
  var shimEllipse = !('ellipse' in native2dCtx);
  var shimPath = !nativePathClass;
  var shimHitRegions = !('addHitRegion' in native2dCtx);

  var recordOps = shimEllipticalArcTo || shimPath;

  var defineProp = Object.defineProperty;
  var getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var getOwnPropNames = Object.getOwnPropertyNames;

  var transformClass, idTransform, pathClass;

  function defineLazyProp(obj, prop, desc) {
    defineProp(obj, prop, {
      get: function () {
        var val;
        if (desc.get) {
          val = desc.get.call(this);
          defineProp(this, prop, {
            value: val,
            writable: desc.writable,
            configurable: desc.configurable,
            enumerable: desc.enumerable
          });
        } else {
          val = desc.value;
        }
        return val;
      },
      configurable: true
    });
  }

  function mixinProps(dest, source) {
    var props = getOwnPropNames(source);
    for (var i = 0; i < props.length; i++) {
      var key = props[i];
      if (key in dest) {
        defineProp(dest, '_' +  key, {
          value: dest[key],
          configurable: true
        });
      }

      var desc = getOwnPropDesc(source, key);
      defineProp(dest, key, desc);
    }
  }

  function evalf(format) {
    var args = arguments;
    return (1, eval)('1,' +
      format.replace(/\$(\$|\d{1,2})/g, function (match, p1) {
        return +p1 ? args[p1] : p1;
      })
    );
  }

  function parseSvgDataStr(sink, d) {
    var chunks = (d + '').match(/[a-z][^a-z]*/gi);

    var x0 = 0;
    var y0 = 0;
    var cpx = 0;
    var cpy = 0;

    for (var i = 0; i < chunks.length; i++) {
      var seg = chunks[i];
      var cmd = seg[0].toUpperCase();

      if (cmd === 'Z') {
        sink.closePath();
        continue;
      }

      var abs = cmd === seg[0];
      var args = seg.slice(1)
                    .trim()
                    .replace(/(\d)-/g, '$1 -')
                    .split(/,|\s/)
                    .map(parseFloat);
      var narg = args.length;

      var x = x0;
      var y = y0;

      var j = 0;
      while (j < narg) {
        x0 = x;
        y0 = y;

        if (abs)
          x = y = 0;

        switch (cmd) {
        case 'A':
          var rx = args[j++];
          var ry = args[j++];
          var rotation = args[j++] * PI / 180;
          var large = args[j++];
          var sweep = args[j++];

          x += args[j++];
          y += args[j++];

          var u = Math.cos(rotation);
          var v = Math.sin(rotation);

          var h1x = (x0 - x) / 2;
          var h1y = (y0 - y) / 2;
          var x1 = u * h1x + v * h1y;
          var y1 = -v * h1x + u * h1y;

          var prx = rx * rx;
          var pry = ry * ry;
          var plx = x1 * x1;
          var ply = y1 * y1;

          var pl = plx / prx + ply / pry;
          if (pl > 1) {
            rx *= Math.sqrt(pl);
            ry *= Math.sqrt(pl);
            prx = rx * rx;
            pry = ry * ry;
          }

          var sq = (prx * pry - prx * ply - pry * plx) / (prx * ply + pry * plx);
          var coef = (large === sweep ? -1 : 1) * (sq < 0 ? 0 : Math.sqrt(sq));
          var ox = coef * rx * y1 / ry;
          var oy = coef * -ry * x1 / rx;

          var h2x = (x0 + x) / 2;
          var h2y = (y0 + y) / 2;
          var cx = u * ox - v * oy + h2x;
          var cy = v * ox + u * oy + h2y;

          var ux = (x1 - ox) / rx;
          var uy = (y1 - oy) / ry;
          var vx = (-x1 - ox) / rx;
          var vy = (-y1 - oy) / ry;

          var n0 = Math.sqrt(ux * ux + uy * uy);
          var a0 = (uy < 0 ? -1 : 1) * Math.acos(ux / n0);

          var n1 = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
          var p = ux * vx + uy * vy;
          var aext = (ux * vy - uy * vx < 0 ? -1 : 1) * Math.acos(p / n1);
          if (sweep) {
            if (aext < 0)
              aext += PI_DOUBLE;
          } else if (aext > 0) {
            aext += PI_DOUBLE;
          }
          var a1 = a0 + aext;

          sink.ellipse(cx, cy, rx, ry, rotation, a0, a1, !sweep);
          break;
        case 'C':
          var x1 = x + args[j++];
          var y1 = y + args[j++];

          cpx = x + args[j++];
          cpy = y + args[j++];

          x += args[j++];
          y += args[j++];

          sink.bezierCurveTo(x1, y1, cpx, cpy, x, y);
          break;
        case 'H':
          x += args[j++];
          sink.lineTo(x, y);
          break;
        case 'L':
          x += args[j++];
          y += args[j++];
          sink.lineTo(x, y);
          break;
        case 'M':
          x += args[j++];
          y += args[j++];
          sink.moveTo(x, y);
          break;
        case 'Q':
          cpx = x + args[j++];
          cpy = y + args[j++];

          x += args[j++];
          y += args[j++];

          sink.quadraticCurveTo(cpx, cpy, x, y);
          break;
        case 'S':
          var x1 = x0 * 2 - cpx;
          var y1 = y0 * 2 - cpy;

          cpx = x + args[j++];
          cpy = y + args[j++];

          x += args[j++];
          y += args[j++];

          sink.bezierCurveTo(x1, y1, cpx, cpy, x, y);
          break;
        case 'T':
          cpx = x0 * 2 - cpx;
          cpy = y0 * 2 - cpy;

          x += args[j++];
          y += args[j++];

          sink.quadraticCurveTo(cpx, cpy, x, y);
          break;
        case 'V':
          y += args[j++];
          sink.lineTo(x, y);
          break;
        default:
          return;
        }
      }
    }
  }

  try {
    var idTransform = new SVGMatrix;
    transformClass = idTransform.constructor;
  } catch (e) {
    var svgElement = doc.createElementNS(SVG_NAMESPACE, 'svg');

    transformClass = function SVGMatrix() {
      return svgElement.createSVGMatrix();
    }
    transformClass.prototype = SVGMatrix.prototype;

    idTransform = new transformClass;
  }

  if (shimCurrentTransform) {
    defineLazyProp(kanvas2dCtxProto, '_ct', {
      get: function () {
        return new transformClass;
      }
    });
    defineLazyProp(kanvas2dCtxProto, '_ctm', {
      get: function () {
        return new Float32Array([1, 0, 0, 1, 0, 0]);
      }
    });
    defineLazyProp(kanvas2dCtxProto, '_stack', { get: Array });

    defineProp(kanvas2dCtxProto, 'currentTransform', {
      get: function () {
        return this._ct;
      },
      set: function(val) {
        if (!(val instanceof transformClass))
          throw new TypeError;

        this.setTransform(val.a, val.b, val.c, val.d, val.e, val.f);

        defineProp(this, '_ct', { value: val });
      }
    });

    kanvas2dCtxProto.save = function () {
      this._save();

      var ctm = this._ctm;
      this._stack.push([ctm[0], ctm[1], ctm[2], ctm[3], ctm[4], ctm[5]]);
    };
    kanvas2dCtxProto.restore = function () {
      this._restore();

      var stack = this._stack;
      if (stack.length) {
        var m = stack.pop();
        this.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      }
    };

    kanvas2dCtxProto.scale = function (x, y) {
      var ctm = this._ctm;
      this.setTransform(
        ctm[0] * x, ctm[1] * x,
        ctm[2] * y, ctm[3] * y,
        ctm[4], ctm[5]
      );
    };
    kanvas2dCtxProto.rotate = function (angle) {
      var ctm = this._ctm;
      var u = Math.cos(angle);
      var v = Math.sin(angle);
      this.setTransform(
        ctm[0] * u + ctm[2] * v,
        ctm[1] * u + ctm[3] * v,
        ctm[0] * -v + ctm[2] * u,
        ctm[1] * -v + ctm[3] * u,
        ctm[4], ctm[5]
      );
    };
    kanvas2dCtxProto.translate = function (x, y) {
      var ctm = this._ctm;
      this.setTransform(
        ctm[0], ctm[1],
        ctm[2], ctm[3],
        ctm[0] * x + ctm[2] * y + ctm[4],
        ctm[1] * x + ctm[3] * y + ctm[5]
      );
    };
    kanvas2dCtxProto.transform = function (a, b, c, d, e, f) {
      var ctm = this._ctm;
      this.setTransform(
        ctm[0] * a + ctm[2] * b,
        ctm[1] * a + ctm[3] * b,
        ctm[0] * c + ctm[2] * d,
        ctm[1] * c + ctm[3] * d,
        ctm[0] * e + ctm[2] * e + ctm[4],
        ctm[1] * f + ctm[3] * f + ctm[5]
      );
    };
    kanvas2dCtxProto.setTransform = function (a, b, c, d, e, f) {
      this._setTransform(a, b, c, d, e, f);

      var ct = this._ct;
      var ctm = this._ctm;
      ct.a = ctm[0] = a;
      ct.b = ctm[1] = b;
      ct.c = ctm[2] = c;
      ct.d = ctm[3] = d;
      ct.e = ctm[4] = e;
      ct.f = ctm[5] = f;
    };

    shimResetTransform = true;
  }

  if (shimResetTransform) {
    kanvas2dCtxProto.resetTransform = function () {
      this.setTransform(1, 0, 0, 1, 0, 0);
    };
  }

  try {
    native2dCtx.arcTo(0, 0, 1, 1, 1, -1);
  } catch (e) {
    shimEllipticalArcTo = true;
  }

  if (shimEllipticalArcTo) {
    kanvas2dCtxProto.arcTo = function (x1, y1, x2, y2, rx, ry, rotation) {
      if (rx < 0 || ry < 0)
        throw RangeError();

      var x0 = x1;
      var y0 = y1;

      var m11 = 1;
      var m12 = 0;
      var m21 = 0;
      var m22 = 1;
      var tx = 0;
      var ty = 0;

      var ops = this._ops;
      var p = ops.length;
      while (p) {
        switch (ops[p - 1]) {
        case PATH_OP_CLOSE:
          p = ops[p - 2];
          if (p) {
            x0 = ops[p];
            y0 = ops[p + 1];
          }
          break;
        case PATH_OP_RECT:
          x0 = ops[p - 5];
          y0 = ops[p - 4];
          break;
        case PATH_OP_ARC:
          var r = ops[p - 5];
          var a = ops[p - 3];
          x0 = ops[p - 7] + Math.cos(a) * r;
          y0 = ops[p - 6] + Math.sin(a) * r;
          break;
        case PATH_OP_ELLIPSE:
          var sx = ops[p - 7];
          var sy = ops[p - 6];
          var rot = ops[p - 5];
          var a = ops[p - 3];
          var u = Math.cos(rot)
          var v = Math.sin(rot);
          var x = Math.cos(a);
          var y = Math.sin(a);
          x0 = x * u * sx + y * v * sy + ops[p - 9];
          y0 = x * -v * sx + y * u * sy + ops[p - 8];
          break;
        case PATH_OP_TRANSFORM:
          m11 = ops[p - 7];
          m12 = ops[p - 6];
          m21 = ops[p - 5];
          m22 = ops[p - 4];
          tx = ops[p - 3];
          ty = ops[p - 2];
          p -= 8;
          continue;
        default:
          x0 = ops[p - 3];
          y0 = ops[p - 2];
        }
        break;
      }

      if (x1 === x0 && y1 === y0) {
        this.moveTo(x1, y1);
        return;
      }

      var dir = (x2 - x1) * (y0 - y1) + (y2 - y1) * (x1 - x0);

      if (x1 === x0 && y1 === y0 ||
          x1 === x2 && y1 === y2 ||
          !rx || !ry ||
          !dir) {
        this.lineTo(x1, y1);
        return;
      }

      var m11 = 1;
      var m12 = 0;
      var m21 = 0;
      var m22 = 1;

      if (rx !== ry) {
        var scale = ry / rx;
        m22 = Math.cos(-rotation);
        m12 = Math.sin(-rotation);
        m11 = m22 / scale;
        m21 = -m12 / scale;

        var ox1 = x0;
        x0 = (ox1 * m22 - y0 * m12) * scale;
        y0 = ox1 * m12 + y0 * m22;

        var ox2 = x1;
        x1 = (ox2 * m22 - y1 * m12) * scale;
        y1 = ox2 * m12 + y1 * m22;

        var ox3 = x2;
        x2 = (ox3 * m22 - y2 * m12) * scale;
        y2 = ox3 * m12 + y2 * m22;
      }

      var pa = (x0 - x1) * (x0 - x1) + (y0 - y1) * (y0 - y1);
      var pb = (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
      var pc = (x0 - x2) * (x0 - x2) + (y0 - y2) * (y0 - y2);

      var cosx = (pa + pb - pc) / (2 * Math.sqrt(pa * pb));
      var sinx = Math.sqrt(1 - cosx * cosx);
      var d = ry / ((1 - cosx) / sinx);

      var sqa = Math.sqrt(pa);
      var anx = (x1 - x0) / sqa;
      var any = (y1 - y0) / sqa;

      var sqb = Math.sqrt(pb);
      var bnx = (x1 - x2) / sqb;
      var bny = (y1 - y2) / sqb;

      var x3 = x1 - anx * d;
      var y3 = y1 - any * d;

      var x4 = x1 - bnx * d;
      var y4 = y1 - bny * d;

      var ccw = dir < 0;

      var cx = x3 + any * ry * (ccw ? 1 : -1);
      var cy = y3 - anx * ry * (ccw ? 1 : -1);

      var a0 = Math.atan2(y3 - cy, x3 - cx);
      var a1 = Math.atan2(y4 - cy, x4 - cx);

      this.save();
      this.transform(m11, m12, m21, m22, 0, 0);
      this.lineTo(x3, y3);
      this.arc(cx, cy, ry, a0, a1, ccw);
      this.restore();
    };
  }

  if (shimEllipse) {
    kanvas2dCtxProto.ellipse = function (cx, cy, rx, ry, rotation, a0, a1, ccw) {
      if (rx < 0 || ry < 0)
        throw RangeError();

      if (rx === ry) {
        this.arc(cx, cy, rx, a0, a1, ccw);
        return;
      }

      var u = Math.cos(rotation);
      var v = Math.sin(rotation);
      this.save();
      this.transform(u * rx, v * rx, -v * ry, u * ry, cx, cy);
      this.arc(0, 0, 1, a0, a1, ccw);
      this.restore();
    };
  }

  if (shimPath) {
    pathClass = function Path(d) {
      if (!(this instanceof Path))
        return new Path(d);

      var obj = this;

      if (nativePathClass) {
        obj = new nativePathClass;
        mixinProps(obj, kanvasPathProto);
      }

      if (arguments.length) {
        if (d instanceof Path)
          obj.addPath(d);
        else
          parseSvgDataStr(obj, d);
      }

      return obj;
    };

    defineLazyProp(kanvasPathProto, '_bounds', {
      get: function () {
        return new Float32Array([0xffff, 0xffff, -0xffff, -0xffff]);
      }
    });

    kanvasPathProto.closePath = function () {

    };
    kanvasPathProto.moveTo = function (x, y) {

    };
    kanvasPathProto.lineTo = function (x, y) {

    };
    kanvasPathProto.quadraticCurveTo = function (cpx, cpy, x, y) {

    };
    kanvasPathProto.bezierCurveTo = function (cp1x, cp1y, cp2x, cp2y, x, y) {

    };
    kanvasPathProto.arcTo = function (x1, y1, x2, y2, rx, ry, rotation) {

    };
    kanvasPathProto.rect = function (x, y, w, h) {

    };
    kanvasPathProto.arc = function (cx, cy, r, a0, a1, ccw) {

    };
    kanvasPathProto.ellipse = function (x, y, rx, ry, rotation, a0, a1, ccw) {

    };

    kanvasPathProto.getBoundingRect = function () {
      return { left: 0, top: 0, right: 0, bottom: 0 };
    };
    kanvasPathProto.isPointInPath = function () {
      return false;
    };

    if (nativePathClass)
      pathClass.prototype = nativePathClass.prototype;
    else
      pathClass.prototype = kanvasPathProto;

    defineProp(kanvas2dCtxProto, 'currentPath', {
      get: function () {
        var path = new pathClass;
        path._copyFrom(this);
        return path;
      },
      set: function (val) {
        if (!(val instanceof pathClass))
          throw new TypeError;

        this.beginPath();
        this._copyFrom(val);
      }
    });

    kanvas2dCtxProto.beginPath = function () {
      this._beginPath();
      this._ops.length = 0;
    };

    //kanvas2dCtxProto.addPath = function (path) {
    //  if(!(path instanceof pathClass))
    //    throw new TypeError;

    //  this.closePath();
    //  this._copyFrom(path);
    //};
  }

  if (recordOps) {
    defineLazyProp(kanvasPathMethods, '_ops', { get: Array });

    defineProp(kanvasPathMethods, '_sp', { value: 0, writable: true });

    var opHandlers = [];

    [
      ['closePath', '', true],
      ['moveTo', 'x,y', true],
      ['lineTo', 'x,y'],
      ['quadraticCurveTo', 'cpx,cpy,x,y'],
      ['bezierCurveTo', 'cp1x,cp1y,cp2x,cp2y,x,y'],
      ['arcTo', 'x1,y1,x2,y2,rx,ry,rotation'],
      ['rect', 'x,y,w,h'],
      ['arc', 'cx,cy,r,a0,a1,ccw'],
      ['ellipse', 'cx,cy,rx,ry,rotation,a0,a1,ccw']
    ].forEach(function (val, i) {
      var name = val[0];
      var params = val[1];
      var move = val[2];
      var args = [];
      var block = [];
      var moveif = '';

      if (params) {
        params.split(',').forEach(function (val, j) {
          var expr = 'o[p+' + (j + 1) + ']';
          args[j] = expr;
          block[j] = expr + '=+' + val;
        });
        if (!move)
          moveif = 'if(!this._sp)';
      } else if (move) {
        block[0] = 'o[p+1]=this._sp';
      }

      kanvasPathMethods[name] = evalf(
        'function($2){' +
          'this._$1($2);' +

          'var o=this._ops,' +
              'p=o.length;' +

          'o[p]=$3;' +
          '$4;' +
          'o[p+$5]=$3;' +

          '$6this._sp=p+1' +
        '}',
        name, params,
        i,
        block.join(';'),
        block.length + 1,
        moveif
      );

      if (nativePathClass &&
          typeof kanvasPathProto[name] === 'function' &&
          /{([\s\S]*)}/.test(kanvasPathProto[name])) {
        kanvasPathProto[name] = evalf(
          'function ($2){' +
            'this.prototype.$1.call(this$3);' +
            '$4' +
          '}',
          name, params,
          params && ',' + params,
          RegExp.$1
        );
      }

      opHandlers[i] = 'case ' + i + ':' +
        'this._' + name + '(' + args.join(',') + ');' +
        'p+=' + (block.length + 2) + ';'
      ;
    });

    var tprops = 'a,b,c,d,e,f';
    var tmethods = [['setTransform', tprops]];
    var targs = [];
    var tblock = [];

    if (!shimCurrentTransform) {
      tmethods.push(
        ['scale', 'x,y'],
        ['rotate', 'angle'],
        ['translate', 'x,y'],
        ['transform', tprops]
      );
    }

    tprops.split(',').forEach(function (val, i) {
      var expr = 'o[p+' + (i + 1) + ']';
      targs[i] = expr;
      tblock[i] = expr + '=' + 't.' + val +
        (shimCurrentTransform ? '=m[' + i + ']=' + val : '');
    });

    tmethods.forEach(function (val) {
      var name = val[0];
      var params = val[1];
      kanvas2dCtxProto[name] = evalf(
        'function($2){'+
          'this._$1($2);'+

          'var t=this.currentTransform,' +
              'o=this._ops,' +
              'p=o.length$3' +

          'if(o[p-1]===$4)p-=8;' +

          'o[p]=$4;' +
          '$5;' +
          'o[p+7]=$4' +
        '}',
        name, params,
        shimCurrentTransform ? ',m=this._ctm;' : ';',
        PATH_OP_TRANSFORM,
        tblock.join(';')
      );
    });

    opHandlers.push(
      'case ' + PATH_OP_TRANSFORM + ':' +
        'this._setTransform(' + targs.join(',') + ');' +
        'p+=8;'
    );

    defineProp(kanvasPathMethods, '_copyFrom', {
      value: evalf(
        'function(sink){' +
          'this.beginPath();' +

          'var o=sink._ops,' +
              'p=0;' +

          'while(p<o.length)' +
            'switch(o[p]){$1}' +
        '}',
        opHandlers.join('break;')
      )
    });
  }

  mixinProps(kanvas2dCtxProto, kanvasPathMethods);
  mixinProps(kanvasPathProto, kanvasPathMethods);

  defineProp(nativeCanvasProto, '_pctx', { value: null });

  nativeCanvasProto._getContext = nativeCanvasProto.getContext;
  nativeCanvasProto.getContext = function (ctxId) {
    var pctx = this._pctx;
    var ctx;

    if (ctxId === 'kanvas-2d') {
      ctx = this._getContext('2d');

      if (pctx)
        return pctx === ctx ? ctx : null;

      mixinProps(ctx, kanvas2dCtxProto);
    } else {
      ctx = this._getContext.apply(this, arguments);
    }

    if (!pctx && ctx !== null)
      defineProp(ctx, '_pctx', { value: ctx });

    return ctx;
  };

  Kanvas.SVGMatrix = transformClass;
  Kanvas.Path = pathClass;

  return Kanvas;

}(document));
