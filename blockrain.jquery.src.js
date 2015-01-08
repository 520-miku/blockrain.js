/**
 * BlockRain.js is based on http://mrcoles.com/tetris/
 * I haven't seen it on github, but it's one of the better js Tetris clones out there
 */

$.fn.safekeypress = function(func, cfg) {

  cfg = $.extend({
    stopKeys: {37:1, 38:1, 39:1, 40:1}
  }, cfg);

  function isStopKey(evt) {
    var isStop = (cfg.stopKeys[evt.keyCode] || (cfg.moreStopKeys && cfg.moreStopKeys[evt.keyCode]));
    if (isStop) evt.preventDefault();
    return isStop;
  }

  function getKey(evt) { return 'safekeypress.' + evt.keyCode; }

  function keypress(evt) {
    var key = getKey(evt),
        val = ($.data(this, key) || 0) + 1;
    $.data(this, key, val);
    if (val > 0) return func.call(this, evt);
    return isStopKey(evt);
  }

  function keydown(evt) {
    var key = getKey(evt);
    $.data(this, key, ($.data(this, key) || 0) - 1);
    return func.call(this, evt);
  }

  function keyup(evt) {
    $.data(this, getKey(evt), 0);
    return isStopKey(evt);
  }

  return $(this).keypress(keypress).keydown(keydown).keyup(keyup);
};


$.fn.blockrain = function( customOptions ) {

  return this.each(function() {

    var options = {
      autoplay: false,
      showFieldOnStart: true,
      theme: null,
      blockWidth: 10,
      autoBlockWidth: false,
      autoBlockSize: 24,
      difficulty: 'normal',

      playText: 'Let\'s play some Tetris',
      playButtonText: 'Play',
      gameOverText: 'Game Over',
      restartButtonText: 'Play Again',
      scoreText: 'Score',

      onStart: function(){},
      onRestart: function(){},
      onGameOver: function(){}
    };

    if( typeof customOptions !== "object" ) {
      customOptions = {};
    }
    options = $.extend(options, customOptions);

    if( typeof options.theme === 'string' ) {
      options.theme = $.fn.blockrain.themes[options.theme];
    }
    if( typeof options.theme === 'undefined' || options.theme === null ) {
      options.theme = $.fn.blockrain.themes['retro'];
    }


    /**
     * Find base64 encoded images and load them as image objects, which can be used by the canvas renderer
     */
    var preloadThemeAssets = function() {
      if( typeof options.theme.blocks !== 'undefined' ){
        var keys = Object.keys(options.theme.blocks);
        var base64check = new RegExp('^data:image/(png|gif|jpg);base64,', 'i');;

        // Load the blocks
        for( var i = 0; i < keys.length; i++ ) {
          options.theme.blocks[ keys[i] ]
          if( typeof options.theme.blocks[ keys[i] ] === 'string' ) {
            if( base64check.test( options.theme.blocks[ keys[i] ] ) ) {
              var base64src = options.theme.blocks[ keys[i] ];
              options.theme.blocks[ keys[i] ] = new Image();
              options.theme.blocks[ keys[i] ].src = base64src;
            }
          }
        }
      }

      // Load the bg
      if( typeof options.theme.backgroundGrid !== 'undefined' ){
        if( typeof options.theme.backgroundGrid === 'string' ) {
          if( base64check.test( options.theme.backgroundGrid ) ) {
            var base64src = options.theme.backgroundGrid;
            options.theme.backgroundGrid = new Image();
            options.theme.backgroundGrid.src = base64src;
          }
        }
      }

    };

    // Load the image assets
    preloadThemeAssets();

    if( isNaN(parseInt(options.theme.strokeWidth)) || typeof parseInt(options.theme.strokeWidth) !== 'number' ) {
      options.theme.strokeWidth = 2;
    }

    var $game = $(this);
    var $gameholder = $('<div class="blockrain-game-holder"></div>');
    $game.html('').append($gameholder);

    $gameholder.css('position', 'relative').css('width', '100%').css('height', '100%');

    if( options.autoBlockWidth ) {
      options.blockWidth = Math.ceil( $game.width() / options.autoBlockSize );
    }
    

    // Create the canvas
    var $canvas = $('<canvas style="display:block; width:100%; height:100%; padding:0; margin:0; border:none;" />');
    if( typeof options.theme.background === 'string' ) {
      $canvas.css('background-color', options.theme.background);
    }
    $gameholder.append($canvas);

    // Score
    var $score = $(
      '<div class="blockrain-score-holder" style="position:absolute;">'+
        '<div class="blockrain-score">'+
          '<div class="blockrain-score-msg">'+ options.scoreText +'</div>'+
          '<div class="blockrain-score-num">0</div>'+
        '</div>'+
      '</div>').hide();
    var $scoreText = $score.find('.blockrain-score-num');
    $gameholder.append($score);

    // Create the start menu
    var $start = $(
      '<div class="blockrain-start-holder" style="position:absolute;">'+
        '<div class="blockrain-start">'+
          '<div class="blockrain-start-msg">'+ options.playText +'</div>'+
          '<a class="blockrain-btn blockrain-start-btn">'+ options.playButtonText +'</a>'+
        '</div>'+
      '</div>').hide();
    $gameholder.append($start);
    
    $start.find('.blockrain-start-btn').click(function(event){
      event.preventDefault();
      startBoard();
      options.onStart();
    });

    // Create the game over menu
    var $gameover = $(
      '<div class="blockrain-game-over-holder" style="position:absolute;">'+
        '<div class="blockrain-game-over">'+
          '<div class="blockrain-game-over-msg">'+ options.gameOverText +'</div>'+
          '<a class="blockrain-btn blockrain-game-over-btn">'+ options.restartButtonText +'</a>'+
        '</div>'+
      '</div>').hide();
    $gameover.find('.blockrain-game-over-btn').click(function(event){
      event.preventDefault();
      startBoard();
      options.onRestart();
    });
    $gameholder.append($gameover);


    var getNiceShapes = function(shapeFactory, undefined) {
      /*
       * Things I need for this to work...
       *  - ability to test each shape with filled data
       *  - maybe give empty spots scores? and try to maximize the score?
       */

      var shapes = {},
          attr;

      for (attr in shapeFactory) {
        shapes[attr] = shapeFactory[attr]();
      }

      function scoreBlocks(possibles, blocks, x, y, filled, width, height) {
        var i, len=blocks.length, score=0, bottoms = {}, tx, ty, overlaps;

        // base score
        for (i=0; i<len; i+=2) {
          score += possibles[filled.asIndex(x + blocks[i], y + blocks[i+1])] || 0;
        }

        // overlap score -- //TODO - don't count overlaps if cleared?
        for (i=0; i<len; i+=2) {
          tx = blocks[i];
          ty = blocks[i+1];
          if (bottoms[tx] === undefined || bottoms[tx] < ty) {
            bottoms[tx] = ty;
          }
        }
        overlaps = 0;
        for (tx in bottoms) {
          tx = parseInt(tx);
          for (ty=bottoms[tx]+1, i=0; y+ty<height; ty++, i++) {
            if (!filled.check(x + tx, y + ty)) {
              overlaps += i == 0 ? 2 : 1; //TODO-score better
              //if (i == 0) overlaps += 1;
              break;
            }
          }
        }

        score = score - overlaps;

        return score;
      }

      function resetShapes() {
        for (var attr in shapes) {
          shapes[attr].x = 0;
          shapes[attr].y = -1;
        }
      }

      //TODO -- evil mode needs to realize that overlap is bad...
      var func = function(filled, checkCollisions, width, height, mode, _one_shape) {
        if (!_one_shape) resetShapes();

        var possibles = new Array(width * height),
            evil = mode == 'evil',
            x, y, py,
            attr, shape, i, blocks, bounds,
            score, best_shape, best_score = (evil ? 1 : -1) * 999, best_orientation, best_x,
            best_score_for_shape, best_orientation_for_shape, best_x_for_shape;

        for (x=0; x<width; x++) {
          for (y=0; y<=height; y++) {
            if (y == height || filled.check(x, y)) {
              for (py=y-4; py<y; py++) {
                possibles[filled.asIndex(x, py)] = py; //TODO - figure out better scoring?
              }
              break;
            }
          }
        }

        // for each shape...
        var opts = _one_shape === undefined ? shapes : {cur: _one_shape}; //BOO
        for (attr in opts) { //TODO - check in random order to prevent later shapes from winning
          shape = opts[attr];
          best_score_for_shape = -999;

          // for each orientation...
          for (i=0; i<(shape.symmetrical ? 2 : 4); i++) { //TODO - only look at unique orientations
            blocks = shape.getBlocks(i);
            bounds = shape.getBounds(blocks);

            // try each possible position...
            for (x=-bounds.left; x<width - bounds.width; x++) {
              for (y=-1; y<height - bounds.bottom; y++) {
                if (checkCollisions(x, y + 1, blocks, true)) {
                  // collision
                  score = scoreBlocks(possibles, blocks, x, y, filled, width, height);
                  if (score > best_score_for_shape) {
                    best_score_for_shape = score;
                    best_orientation_for_shape = i;
                    best_x_for_shape = x;
                  }
                  break;
                }
              }
            }
          }

          if ((evil && best_score_for_shape < best_score) ||
              (!evil && best_score_for_shape > best_score)) {
            best_shape = shape;
            best_score = best_score_for_shape;
            best_orientation = best_orientation_for_shape;
            best_x = best_x_for_shape;
          }
        }

        best_shape.best_orientation = best_orientation;
        best_shape.best_x = best_x;

        return best_shape;
      };

      func.no_preview = true;
      return func;
    };


    // The game height is fixed at the start of the game
    var canvas = $canvas.get(0),
        ctx = canvas.getContext('2d'),
        WIDTH = options.blockWidth,
        HEIGHT = Math.floor($game.innerHeight() / $game.innerWidth() * WIDTH),
        PIXEL_WIDTH = $game.innerWidth(),
        PIXEL_HEIGHT = $game.innerHeight(),
        block_size = Math.floor(PIXEL_WIDTH / WIDTH),
        border_width = 2,
        autopilot = false;


    /**
     * Update the sizes of the renderer (this makes the game responsive)
     */
    function updateSizes() {
      PIXEL_WIDTH = $game.innerWidth();
      PIXEL_HEIGHT = $game.innerHeight();

      block_size = Math.floor(PIXEL_WIDTH / WIDTH);

      // Recalculate the pixel width and height so the canvas always has the best possible size
      PIXEL_WIDTH = block_size * WIDTH;
      PIXEL_HEIGHT = block_size * HEIGHT;

      border_width = 2;
      $canvas .attr('width', PIXEL_WIDTH)
              .attr('height', PIXEL_HEIGHT);
    }

    updateSizes();

    $(window).resize(function(){
      updateSizes();
    });

    function randInt(a, b) { return a + Math.floor(Math.random() * (1 + b - a)); }
    function randSign() { return randInt(0, 1) * 2 - 1; }
    function randChoice(choices) { return choices[randInt(0, choices.length-1)]; }

    /**
     * Draws the background
     */
    function drawBackground(_ctx) {
      _ctx = _ctx || ctx;

      if( typeof options.theme.background !== 'string' ) {
        return;
      }

      if( options.theme.backgroundGrid instanceof Image ) {

        // Not loaded
        if( options.theme.backgroundGrid.width === 0 || options.theme.backgroundGrid.height === 0 ){ return; }

        _ctx.globalAlpha = 1.0;

        for( var x=0; x<WIDTH; x++ ) {
          for( var y=0; y<HEIGHT; y++ ) {
            var cx = x * block_size;
            var cy = y * block_size;

            _ctx.drawImage( options.theme.backgroundGrid, 
                            0, 0, options.theme.backgroundGrid.width, options.theme.backgroundGrid.height, 
                            cx, cy, block_size, block_size);
          }
        }

      }
      else if( typeof options.theme.backgroundGrid === 'string' ) {

        var borderWidth = options.theme.strokeWidth;
        var borderDistance = Math.round(block_size*0.23);
        var squareDistance = Math.round(block_size*0.30);

        _ctx.globalAlpha = 1.0;
        _ctx.fillStyle = options.theme.backgroundGrid;

        for( var x=0; x<WIDTH; x++ ) {
          for( var y=0; y<HEIGHT; y++ ) {
            var cx = x * block_size;
            var cy = y * block_size;

            _ctx.fillRect(cx+borderWidth, cy+borderWidth, block_size-borderWidth*2, block_size-borderWidth*2);
          }
        }

      }

      _ctx.globalAlpha = 1.0;
    }

    /**
     * Draws one block (Each piece is made of 4 blocks)
     */
    function drawBlock(x, y, blockType, _ctx) {
      // convert x and y to pixel
      _ctx = _ctx || ctx;
      x = x * block_size;
      y = y * block_size;

      var borderWidth = options.theme.strokeWidth;
      var borderDistance = Math.round(block_size*0.23);
      var squareDistance = Math.round(block_size*0.30);

      var color = getBlockColor(blockType, false);

      // Draw the main square
      _ctx.globalAlpha = 1.0;

      // If it's an image, the block has a specific texture. Use that.
      if( color instanceof Image ) {
        _ctx.globalAlpha = 1.0;

        // Not loaded
        if( color.width === 0 || color.height === 0 ){ return; }

        _ctx.drawImage(color, 0, 0, color.width, color.height, x, y, block_size, block_size);

      }
      else if( typeof color === 'string' )
      {
        _ctx.fillStyle = color;
        _ctx.fillRect(x, y, block_size, block_size);

        // Inner Shadow
        if( typeof options.theme.innerShadow === 'string' ) {
          _ctx.globalAlpha = 1.0;
          _ctx.strokeStyle = options.theme.innerShadow;
          _ctx.lineWidth = 1.0;

          // Draw the borders
          _ctx.strokeRect(x+1, y+1, block_size-2, block_size-2);
        }

        // Decoration (borders)
        if( typeof options.theme.stroke === 'string' ) {
          _ctx.globalAlpha = 1.0;
          _ctx.fillStyle = options.theme.stroke;
          _ctx.strokeStyle = options.theme.stroke;
          _ctx.lineWidth = borderWidth;

          // Draw the borders
          _ctx.strokeRect(x, y, block_size, block_size);
        }
        if( typeof options.theme.innerStroke === 'string' ) {
          // Draw the inner dashes
          _ctx.fillStyle = options.theme.innerStroke;
          _ctx.fillRect(x+borderDistance, y+borderDistance, block_size-borderDistance*2, borderWidth);
          // The rects shouldn't overlap, to prevent issues with transparency
          _ctx.fillRect(x+borderDistance, y+borderDistance+borderWidth, borderWidth, block_size-borderDistance*2-borderWidth);
        }
        if( typeof options.theme.innerSquare === 'string' ) {
          // Draw the inner square
          _ctx.fillStyle = options.theme.innerSquare;
          _ctx.globalAlpha = 0.2;
          _ctx.fillRect(x+squareDistance, y+squareDistance, block_size-squareDistance*2, block_size-squareDistance*2);
        }
      }

      // Return the alpha back to 1.0 so we don't create any issues with other drawings.
      _ctx.globalAlpha = 1.0;
    }


    // Theming
    function getBlockColor(blockName, falling) {
      /**
       * The theme allows us to do many things:
       * - Use a specific color for the falling block (primary), regardless of the proper color.
       * - Use another color for the placed blocks (secondary).
       * - Default to the "original" block color in any of those cases by setting primary and/or secondary to null.
       * - With primary and secondary as null, all blocks keep their original colors.
       */

      if( typeof falling !== 'boolean' ){ falling = true; }
      if( falling ) {
        if( typeof options.theme.primary === 'string' && options.theme.primary !== '' ) {
          return options.theme.primary;
        } else {
          return options.theme.blocks[blockName];
        }
      } else {
        if( typeof options.theme.secondary === 'string' && options.theme.secondary !== '' ) {
          return options.theme.secondary;
        } else {
          return options.theme.blocks[blockName];
        }
      }
    };


    function Shape(orientations, symmetrical, blockType) {

      $.extend(this, {
        x: 0,
        y: 0,
        symmetrical: symmetrical,
        init: function() {
          $.extend(this, {
            orientation: 0,
            x: Math.floor(WIDTH / 2) - 1,
            y: -1
          });
          return this;
        },
        blockType: blockType,
        blocksLen: orientations[0].length,
        orientations: orientations,
        orientation: 0, // 4 possible
        rotate: function(right) {
          var orientation = (this.orientation + (right ? 1 : -1) + 4) % 4;

          //TODO - when past limit - auto shift and remember that too!
          if (!checkCollisions(this.x, this.y, this.getBlocks(orientation))) {
            this.orientation = orientation;
          }
        },
        moveRight: function() {
          if (!checkCollisions(this.x + 1, this.y, this.getBlocks())) {
            this.x++;
          }
        },
        moveLeft: function() {
          if (!checkCollisions(this.x - 1, this.y, this.getBlocks())) {
            this.x--;
          }
        },
        getBlocks: function(orientation) { // optional param
          return this.orientations[orientation !== undefined ? orientation : this.orientation];
        },
        draw: function(drop, _x, _y, _orientation, _ctx) {
          if (drop) this.y++;

          var blocks = this.getBlocks(_orientation),
              x = _x === undefined ? this.x : _x,
              y = _y === undefined ? this.y : _y,
              i = 0;
          for (; i<this.blocksLen; i += 2) {
            drawBlock(x + blocks[i], y + blocks[i+1], this.blockType, _ctx);
          }
        },
        getBounds: function(_blocks) { // _blocks can be an array of blocks, an orientation index, or undefined
          var blocks = $.isArray(_blocks) ? _blocks : this.getBlocks(_blocks),
              i=0, len=blocks.length, minx=999, maxx=-999, miny=999, maxy=-999;
          for (; i<len; i+=2) {
            if (blocks[i] < minx) { minx = blocks[i]; }
            if (blocks[i] > maxx) { maxx = blocks[i]; }
            if (blocks[i+1] < miny) { miny = blocks[i+1]; }
            if (blocks[i+1] > maxy) { maxy = blocks[i+1]; }
          }
          return {
            left: minx,
            right: maxx,
            top: miny,
            bottom: maxy,
            width: maxx - minx,
            height: maxy - miny
          };
        }
      });

      return this.init();
    };


    /**
     * All the available shapes
     */
    var shapeFactory = {
      line: function() {
        /*
         *   X        X
         *   O  XOXX  O XOXX
         *   X        X
         *   X        X
         */
        var ver = [0, -1, 0, -2, 0, -3, 0, -4],
        hor = [-1, -2, 0, -2, 1, -2, 2, -2];
        return new Shape([ver, hor, ver, hor], true, 'line');
      },
      square: function() {
        /*
         *  XX
         *  XX
         */
        var s = [0, 0, 1, 0, 0, -1, 1, -1];
        return new Shape([s, s, s, s], true, 'square');
      },
      arrow: function() {
        /*
         *    X   X       X
         *   XOX  OX XOX XO
         *        X   X   X
         */
        return new Shape([
          [0, -1, 1, -1, 2, -1, 1, -2],
          [1, -2, 1, -1, 1, 0, 2, -1],
          [0, -1, 1, -1, 2, -1, 1, 0],
          [0, -1, 1, -1, 1, -2, 1, 0]
        ], false, 'arrow');
      },
      rightHook: function() {
        /*
         *       XX   X X
         *   XOX  O XOX O
         *   X    X     XX
         */
        return new Shape([
          [0, 0, 0, -1, 1, -1, 2, -1],
          [0, -2, 1, 0, 1, -1, 1, -2],
          [0, -1, 1, -1, 2, -1, 2, -2],
          [0, -2, 0, -1, 0, 0, 1, 0]
        ], false, 'rightHook');
      },
      leftHook: function() {
        /*
         *        X X   XX
         *   XOX  O XOX O
         *     X XX     X
         */
        return new Shape([
          [2, 0, 0, -1, 1, -1, 2, -1],
          [0, 0, 1, 0, 1, -1, 1, -2],
          [0, -2, 0, -1, 1, -1, 2, -1],
          [0, 0, 0, -1, 0, -2, 1, -2]
        ], false, 'leftHook');
      },
      leftZag: function() {
        /*
         *        X
         *   XO  OX
         *    XX X
         */
        var ver = [0, 0, 0, -1, 1, -1, 1, -2],
            hor = [0, -1, 1, -1, 1, 0, 2, 0];
        return new Shape([hor, ver, hor, ver], true, 'leftZag');
      },
      rightZag: function() {
        /*
         *       X
         *    OX OX
         *   XX   X
         */
        var ver = [0, -2, 0, -1, 1, -1, 1, 0],
            hor = [0, 0, 1, 0, 1, -1, 2, -1];
        return new Shape([hor, ver, hor, ver], true, 'rightZag');
      }
    };


    var shapeFuncs = [];
    $.each(shapeFactory, function(k,v) { shapeFuncs.push(v); });

    var filled = {
        data: new Array(WIDTH * HEIGHT),
        score: 0,
        toClear: {},
        check: function(x, y) {
          return this.data[this.asIndex(x, y)];
        },
        add: function(x, y, blockType) {
          if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
            this.data[this.asIndex(x, y)] = blockType;
          }
        },
        asIndex: function(x, y) {
          return x + y*WIDTH;
        },
        asX: function(index) {
          return index % WIDTH;
        },
        asY: function(index) {
          return Math.floor(index / WIDTH);
        },
        clearAll: function() {
          this.data = new Array(WIDTH * HEIGHT);
        },
        _popRow: function(row_to_pop) {
          for (var i=WIDTH*(row_to_pop+1) - 1; i>=0; i--) {
            this.data[i] = (i >= WIDTH ? this.data[i-WIDTH] : undefined);
          }
        },
        checkForClears: function() {
          var startLines = board.lines;
          var rows = [], i, len, count, mod;

          for (i=0, len=this.data.length; i<len; i++) {
            mod = this.asX(i);
            if (mod == 0) count = 0;
            if (this.data[i] && typeof this.data[i] == 'string') {
                count += 1;
            }
            if (mod == WIDTH - 1 && count == WIDTH) {
              rows.push(this.asY(i));
            }
          }

          for (i=0, len=rows.length; i<len; i++) {
            this._popRow(rows[i]);
            board.lines++;
            if (board.lines % 10 == 0 && board.dropDelay > 1) {
              //board.dropDelay -= 2;
            }
          }

          var clearedLines = board.lines - startLines;
          this._updateScore(clearedLines);
        },
        _updateScore: function(numLines) {
          if( numLines <= 0 ) { return; }
          var scores = [0,400,1000,3000,12000];
          if( numLines >= scores.length ){ numLines = scores.length-1 }

          this.score += scores[numLines];
          $scoreText.text(this.score);
        },
        _resetScore: function() {
          this.score = 0;
          $scoreText.text(this.score);
        },
        draw: function() {
          for (var i=0, len=this.data.length, row, color; i<len; i++) {
            if (this.data[i] !== undefined) {
              row = this.asY(i);
              blockType = this.data[i];
              drawBlock(this.asX(i), row, blockType);
            }
          }
        }
    };

    function checkCollisions(x, y, blocks, checkDownOnly) {
        // x & y should be aspirational values
        var i = 0, len = blocks.length, a, b;
        for (; i<len; i += 2) {
          a = x + blocks[i];
          b = y + blocks[i+1];

          if (b >= HEIGHT || filled.check(a, b)) {
            return true;
          } else if (!checkDownOnly && a < 0 || a >= WIDTH) {
            return true;
          }
        }
        return false;
    }

    var niceShapes = getNiceShapes(shapeFactory);

    var board = {
        animateDelay: 1000/options.speed,
        cur: null,

        lines: 0,

        dropCount: 0,
        dropDelay: 5, //5,

        init: function() {
          this.cur = this.nextShape();

          var start = [], blockTypes = [], i, ilen, j, jlen, color;

          // Draw a random blockrain screen
          blockTypes = Object.keys(shapeFactory);

          for (i=0, ilen=WIDTH; i<ilen; i++) {
            for (j=0, jlen=randChoice([randInt(0, 8), randInt(5, 9)]); j<jlen; j++) {
              if (!color || !randInt(0, 3)) color = randChoice(blockTypes);
              start.push([i, HEIGHT - j, color]);
            }
          }

          if( options.showFieldOnStart ) {
            drawBackground();
            for (i=0, ilen=start.length; i<ilen; i++) {
              drawBlock.apply(drawBlock, start[i]);
            }
          }

          this.showStartMessage();

        },
        showStartMessage: function() {
          $start.show();
        },
        showGameOverMessage: function() {
          $gameover.show();
        },
        nextShape: function(_set_next_only) {
          var next = this.next,
              func, shape, result;

          if (shapeFactory[info.mode]) {
            func = shapeFactory[info.mode];
          }
          else if (info.mode == 'nice' || info.mode == 'evil') {
            func = niceShapes;
          }
          else {
            func = randChoice(shapeFuncs);
          }

          if (func.no_preview) {
            this.next = null;
            if (_set_next_only) return null;
            shape = func(filled, checkCollisions, WIDTH, HEIGHT, info.mode);
            if (!shape) throw new Error('No shape returned from shape function!', func);
            shape.init();
            result = shape;
          }
          else {
            shape = func(filled, checkCollisions, WIDTH, HEIGHT, info.mode);
            if (!shape) throw new Error('No shape returned from shape function!', func);
            shape.init();
            this.next = shape;
            if (_set_next_only) return null;
            result = next || this.nextShape();
          }

          if (autopilot) { //fun little hack...
            niceShapes(filled, checkCollisions, WIDTH, HEIGHT, 'normal', result);
            result.orientation = result.best_orientation;
            result.x = result.best_x;
          }

          return result;
        },
        animate: function() {
          var drop = false,
              gameOver = false;

          updateSizes();

          if (!this.paused) {
            this.dropCount++;
            if( this.dropCount >= this.dropDelay || autopilot ) {
              drop = true;
              this.dropCount = 0;
            }

            // test for a collision
            if (drop) {
              var cur = this.cur, x = cur.x, y = cur.y, blocks = cur.getBlocks();
              if (checkCollisions(x, y+1, blocks, true)) {
                drop = false;
                for (var i=0; i<cur.blocksLen; i+=2) {
                  filled.add(x + blocks[i], y + blocks[i+1], cur.blockType);
                  if (y + blocks[i] < 0) {
                    gameOver = true;
                  }
                }
                filled.checkForClears();
                this.cur = this.nextShape();
              }
            }

            // Draw the blockrain field
            ctx.clearRect(0, 0, PIXEL_WIDTH, PIXEL_HEIGHT);
            drawBackground();
            filled.draw();
            this.cur.draw(drop);
          }

          if( gameOver ) {

            options.onGameOver(filled.score);

            if( autopilot ) {
              // On autoplay, restart the game automatically
              startBoard();
            }
            else {
              this.showGameOverMessage();
              board.gameOver = true;
            }
          } else {
            window.setTimeout(function() { board.animate(); }, this.animateDelay);
          }
        }
    };

    var info = {
        mode: options.difficulty,
        modes: [
          'normal',
          'nice',
          'evil'
        ],
        modesY: 170,
        autopilotY: null,

        init: function() {
          this.mode = options.difficulty;
        },
        setMode: function(mode) {
          this.mode = mode;
          board.nextShape(true);
        }
    };

    info.init();
    board.init();


    function startBoard(evt) {
      filled.clearAll();
      filled._resetScore();
      board.started = true;
      board.animate();

      $start.fadeOut(150);
      $gameover.fadeOut(150);
      $score.fadeIn(150);

      return false;
    }

    /**
     * Controls
     */
    if( options.autoplay ) {
      // On autoplay, start the game right away
      autopilot = true;
      startBoard();
    }
    else {

      $(document).keyup(function(evt) {
          return (!board.started && (evt.keyCode == 13 || evt.keyCode == 32)) ? startBoard(evt) : true;
      });

      $(document).keyup(function(evt) {
        if (evt.keyCode == 80) { /*p*/
          board.paused = !board.paused;
        }
      });

      $(document).safekeypress(function(evt) {
        var caught = false;
        if (board.cur) {
            caught = true;
            switch(evt.keyCode) {
              case 37: /*left*/ board.cur.moveLeft(); break;
              case 38: /*up*/ board.cur.rotate(true); break;
              case 39: /*right*/ board.cur.moveRight(); break;
              case 40: /*down*/ board.dropCount = board.dropDelay; break;
              case 88: /*x*/ board.cur.rotate(true); break;
              case 90: /*z*/ board.cur.rotate(false); break;
            default: caught = false;
            }
        }
        if (caught) evt.preventDefault();
        return !caught;
      });

    }

  });

};
