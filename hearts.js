/* ============================================================
   hearts.js · 爱心飘落背景动画
   职责：
     1. 用 canvas 绘制轻柔飘落的小爱心（移动端少、桌面端多）
     2. 页面切到后台时暂停，回到前台继续，节省电量
     3. 系统开启「减少动态效果」时完全不启动
   依赖：LoveUtils（prefersReducedMotion）
   ============================================================ */
(function (global) {
  "use strict";

  var Utils = global.LoveUtils;

  var canvas = null;
  var ctx = null;
  var particles = [];
  var animationId = null;
  var width = 0;
  var height = 0;
  var dpr = 1;
  var running = false;

  var HEART_COLORS = [
    "rgba(201, 127, 137, 0.55)",
    "rgba(169, 93, 105, 0.42)",
    "rgba(228, 170, 170, 0.55)",
    "rgba(196, 160, 121, 0.35)"
  ];

  /* ---------- 1. 粒子 ---------- */
  function particleCount() {
    return global.innerWidth < 720 ? 10 : 18;
  }

  function createParticle(spawnAnywhere) {
    var size = 8 + Math.random() * 12;
    return {
      x: Math.random() * width,
      y: spawnAnywhere ? Math.random() * height : -size * 2,
      size: size,
      speed: 0.25 + Math.random() * 0.55, // 下落速度，数值很小所以很轻柔
      sway: 12 + Math.random() * 26, // 左右摆动幅度
      phase: Math.random() * Math.PI * 2,
      drift: 0.006 + Math.random() * 0.01,
      rotation: (Math.random() - 0.5) * 0.5,
      spin: (Math.random() - 0.5) * 0.004,
      opacity: 0.35 + Math.random() * 0.5,
      color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)]
    };
  }

  function resetParticles() {
    particles = [];
    var count = particleCount();
    for (var i = 0; i < count; i++) {
      particles.push(createParticle(true));
    }
  }

  /* ---------- 2. 尺寸 ---------- */
  function resize() {
    if (!canvas) return;
    width = global.innerWidth;
    height = global.innerHeight;
    dpr = Math.min(global.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }
  }

  /* ---------- 3. 绘制 ---------- */
  function drawHeart(x, y, size, rotation, color, opacity) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(size / 16, size / 16);

    ctx.beginPath();
    // 用两段贝塞尔曲线拼出圆润的心形
    ctx.moveTo(0, 4);
    ctx.bezierCurveTo(0, 1, -3, -6, -8, -6);
    ctx.bezierCurveTo(-15, -6, -15, 3, -15, 3);
    ctx.bezierCurveTo(-15, 9, -9, 14, 0, 19);
    ctx.bezierCurveTo(9, 14, 15, 9, 15, 3);
    ctx.bezierCurveTo(15, 3, 15, -6, 8, -6);
    ctx.bezierCurveTo(3, -6, 0, 1, 0, 4);
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.globalAlpha = opacity;
    ctx.fill();
    ctx.restore();
  }

  function frame() {
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    var time = performance.now() / 1000;

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];

      p.y += p.speed;
      p.phase += p.drift;
      p.rotation += p.spin;

      var x = p.x + Math.sin(p.phase) * p.sway;

      // 靠近顶部与底部时淡入淡出，避免突然出现 / 消失
      var fade = 1;
      if (p.y < 90) fade = Math.max(0, p.y / 90);
      if (p.y > height - 120) fade = Math.max(0, (height - p.y) / 120);

      drawHeart(
        x,
        p.y,
        p.size * (0.9 + Math.sin(time + p.phase) * 0.06),
        p.rotation,
        p.color,
        p.opacity * fade
      );

      // 飘出屏幕后从顶部重新开始
      if (p.y > height + 40) {
        particles[i] = createParticle(false);
      }
    }

    animationId = global.requestAnimationFrame(frame);
  }

  /* ---------- 4. 启停 ---------- */
  function start() {
    if (running || !ctx) return;
    running = true;
    animationId = global.requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (animationId) {
      global.cancelAnimationFrame(animationId);
      animationId = null;
    }
    if (ctx) ctx.clearRect(0, 0, width, height);
  }

  function handleVisibility() {
    if (document.hidden) stop();
    else start();
  }

  /* ---------- 5. 初始化 ---------- */
  function init() {
    // 尊重系统「减少动态效果」设置，直接不启动
    if (Utils.prefersReducedMotion()) return;

    canvas = document.getElementById("heartCanvas");
    if (!canvas) return;

    ctx = canvas.getContext("2d");
    if (!ctx) return;

    resize();
    resetParticles();
    start();

    global.addEventListener("resize", Utils.debounce(function () {
      resize();
    }, 220));

    document.addEventListener("visibilitychange", handleVisibility);
  }

  global.LoveHearts = {
    init: init,
    stop: stop
  };
})(window);
