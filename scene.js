/* ==========================================================================
   Nabt Farms - scene.js
   1. Page interactions (works with or without WebGL)
   2. Procedural WebGL scene: microgreen field -> Batavia lettuce
   ========================================================================== */

(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ======================================================= 1. PAGE UI === */

  function ui() {
    var nav = document.getElementById("nav");
    var burger = document.getElementById("burger");
    var links = document.getElementById("navLinks");

    if (burger && nav) {
      burger.addEventListener("click", function () {
        var open = nav.classList.toggle("open");
        burger.setAttribute("aria-expanded", open ? "true" : "false");
        burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      });
    }
    if (links && nav && burger) {
      links.addEventListener("click", function (e) {
        if (e.target.tagName === "A") {
          nav.classList.remove("open");
          burger.setAttribute("aria-expanded", "false");
        }
      });
    }

    var onScrollNav = function () {
      if (nav) { nav.classList.toggle("stuck", window.scrollY > 40); }
    };
    onScrollNav();
    window.addEventListener("scroll", onScrollNav, { passive: true });

    var yr = document.getElementById("yr");
    if (yr) { yr.textContent = String(new Date().getFullYear()); }

    /* scroll reveals */
    var items = document.querySelectorAll(".rv");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      for (var i = 0; i < items.length; i++) { items[i].classList.add("in"); }
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            io.unobserve(en.target);
          }
        });
      }, { rootMargin: "0px 0px -12% 0px", threshold: 0.05 });
      for (var j = 0; j < items.length; j++) { io.observe(items[j]); }
    }

    /* grow-room readout drift (illustrative, not a live feed) */
    var specs = {
      ec:    { base: 1.82, span: 0.09, dp: 2 },
      ph:    { base: 5.90, span: 0.12, dp: 1 },
      air:   { base: 21.4, span: 0.6,  dp: 1 },
      rh:    { base: 68,   span: 2.4,  dp: 0 },
      light: { base: 16,   span: 0,    dp: 0 }
    };
    var cells = document.querySelectorAll("[data-metric]");
    if (cells.length && !reduceMotion) {
      setInterval(function () {
        for (var k = 0; k < cells.length; k++) {
          var cell = cells[k];
          var s = specs[cell.getAttribute("data-metric")];
          if (!s || s.span === 0) { continue; }
          var v = s.base + (Math.random() - 0.5) * 2 * s.span;
          cell.textContent = v.toFixed(s.dp);
        }
      }, 2600);
    }

    /* inquiry form */
    var form = document.getElementById("inquiry");
    var note = document.getElementById("note");
    var send = document.getElementById("send");
    if (!form || !note || !send) { return; }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = form.elements.name.value.trim();
      var mail = form.elements.email.value.trim();

      if (!name) { note.className = "form-note bad"; note.textContent = "Add your name so we know who to reply to."; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { note.className = "form-note bad"; note.textContent = "That email address does not look right."; return; }

      var endpoint = form.getAttribute("data-endpoint") || "";
      if (endpoint.indexOf("YOUR_FORM_ID") !== -1) {
        note.className = "form-note bad";
        note.textContent = "Form endpoint not set yet. Email contact@nabtfarms.com in the meantime.";
        return;
      }

      send.disabled = true;
      note.className = "form-note";
      note.textContent = "Sending...";

      fetch(endpoint, {
        method: "POST",
        headers: { "Accept": "application/json" },
        body: new FormData(form)
      }).then(function (res) {
        if (!res.ok) { throw new Error("bad status"); }
        form.reset();
        note.className = "form-note ok";
        note.textContent = "Sent. We reply within one working day.";
      }).catch(function () {
        note.className = "form-note bad";
        note.textContent = "That did not send. Email contact@nabtfarms.com and we will pick it up.";
      }).then(function () {
        send.disabled = false;
      });
    });
  }

  /* ==================================================== 2. WEBGL SCENE === */

  var COL = {
    bg:    [0.027, 0.078, 0.063],
    deep:  [0.055, 0.230, 0.140],
    tip:   [0.470, 0.870, 0.520],
    lumen: [0.760, 0.360, 0.910],
    inner: [0.840, 0.910, 0.520],
    outer: [0.130, 0.420, 0.230]
  };

  function v3(a) { return new THREE.Vector3(a[0], a[1], a[2]); }
  function c3(a) { return new THREE.Vector3(a[0], a[1], a[2]); }
  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  /* ---- merge a list of non-indexed geometries into one -------------- */
  function mergeParts(list) {
    var total = 0, i;
    for (i = 0; i < list.length; i++) { total += list[i].attributes.position.count; }

    var pos = new Float32Array(total * 3);
    var nor = new Float32Array(total * 3);
    var off = 0;

    for (i = 0; i < list.length; i++) {
      var g = list[i];
      pos.set(g.attributes.position.array, off);
      nor.set(g.attributes.normal.array, off);
      off += g.attributes.position.array.length;
      g.dispose();
    }

    var out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    return out;
  }

  /* ---- one microgreen sprout: stem + two cotyledons ----------------- */
  function sproutGeometry() {
    var parts = [];

    var stem = new THREE.PlaneGeometry(0.018, 0.46, 1, 3);
    stem.translate(0, 0.23, 0);
    parts.push(stem.toNonIndexed());

    for (var k = 0; k < 2; k++) {
      var leaf = new THREE.PlaneGeometry(0.30, 0.15, 4, 2);
      leaf.translate(0.15, 0, 0);

      var p = leaf.attributes.position;
      for (var i = 0; i < p.count; i++) {
        var x = p.getX(i), y = p.getY(i);
        var t = x / 0.30;
        var wide = Math.sin(Math.PI * Math.pow(clamp01(t), 0.7));
        p.setY(i, y * (0.22 + 1.15 * wide));
        p.setZ(i, wide * 0.035 - Math.abs(y) * 0.22);
      }
      leaf.computeVertexNormals();

      leaf.applyMatrix4(new THREE.Matrix4().makeRotationZ(0.6));
      leaf.applyMatrix4(new THREE.Matrix4().makeRotationY(k * Math.PI));
      leaf.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.44, 0));
      parts.push(leaf.toNonIndexed());
    }

    return mergeParts(parts);
  }

  /* ---- a Batavia head: phyllotactic rosette of ruffled leaves ------- */
  function lettuceGeometry() {
    var LEAVES = 30;
    var GOLD = 2.399963;          /* golden angle, the real phyllotaxis */
    var parts = [];
    var ages = [];

    for (var i = 0; i < LEAVES; i++) {
      var t = i / (LEAVES - 1);   /* 0 = core leaf, 1 = outer wrapper leaf */
      var leaf = new THREE.PlaneGeometry(1, 1, 9, 11);
      var p = leaf.attributes.position;

      for (var v = 0; v < p.count; v++) {
        var x = p.getX(v);
        var w = p.getY(v) + 0.5;               /* 0 at base, 1 at tip */
        var prof = Math.sin(Math.PI * Math.pow(w, 0.72));
        var nx = x * (0.18 + 0.62 * prof);     /* blade widens then rounds off */

        /* wavy Batavia margin, strongest at the edges and toward the tip */
        var ruffle = Math.sin(nx * 13.0 + i * 1.7) * 0.060 * Math.pow(w, 1.5) * Math.min(1, Math.abs(nx) * 2.6);
        /* cup the blade, deeper on the tight inner leaves */
        var cup = -Math.pow(Math.abs(nx), 1.8) * (0.85 - 0.30 * t);
        /* and let the tip arch back over the core */
        var arc = -Math.pow(w, 2.2) * 0.26;

        p.setX(v, nx);
        p.setY(v, w);
        p.setZ(v, cup + arc + ruffle);
      }
      leaf.computeVertexNormals();

      var sc = 0.38 + 0.53 * t;
      leaf.scale(sc * 0.95, sc * 1.72, sc * 0.95);
      leaf.rotateX(-(0.05 + 0.55 * Math.pow(t, 2.0)));   /* outer leaves splay */
      leaf.rotateY(i * GOLD);
      leaf.translate(0, 0.14 * t, 0);

      var nonIdx = leaf.toNonIndexed();
      for (var a = 0; a < nonIdx.attributes.position.count; a++) { ages.push(t); }
      parts.push(nonIdx);
    }

    var geo = mergeParts(parts);
    geo.setAttribute("aAge", new THREE.BufferAttribute(new Float32Array(ages), 1));
    geo.computeBoundingBox();
    return geo;
  }

  /* ---- shaders ------------------------------------------------------ */

  var FIELD_VERT = [
    "attribute float aTint;",
    "uniform float uTime;",
    "varying float vH;",
    "varying float vTint;",
    "varying float vDepth;",
    "varying vec3 vNrm;",
    "void main(){",
    "  vec4 wp = instanceMatrix * vec4(position,1.0);",
    "  float h = clamp(position.y/0.62,0.0,1.0);",
    "  float ph = wp.x*0.62 + wp.z*0.83;",
    "  float s = sin(uTime*1.25 + ph) + 0.35*sin(uTime*2.7 + ph*1.9);",
    "  wp.x += s * 0.055 * h * h;",
    "  wp.z += cos(uTime*1.05 + ph*0.8) * 0.035 * h * h;",
    "  vec4 mv = modelViewMatrix * wp;",
    "  vDepth = -mv.z;",
    "  vH = h;",
    "  vTint = aTint;",
    "  vNrm = normalize(mat3(instanceMatrix) * normal);",
    "  gl_Position = projectionMatrix * mv;",
    "}"
  ].join("\n");

  var FIELD_FRAG = [
    "uniform vec3 uBg;",
    "uniform vec3 uDeep;",
    "uniform vec3 uTip;",
    "uniform vec3 uLum;",
    "uniform float uFade;",
    "uniform float uNear;",
    "uniform float uFar;",
    "varying float vH;",
    "varying float vTint;",
    "varying float vDepth;",
    "varying vec3 vNrm;",
    "void main(){",
    "  vec3 col = mix(uDeep, uTip, pow(vH,1.25));",
    "  col *= 0.72 + vTint*0.55;",
    "  float d = abs(dot(normalize(vNrm), normalize(vec3(0.28,0.90,0.34))));",
    "  col *= 0.50 + 0.72*d;",
    "  col += uLum * pow(vH,3.5) * 0.30;",
    "  col = mix(col, uBg, smoothstep(uNear,uFar,vDepth));",
    "  col = mix(col, uBg, uFade);",
    "  gl_FragColor = vec4(col,1.0);",
    "}"
  ].join("\n");

  var LEAF_VERT = [
    "attribute float aAge;",
    "uniform float uTime;",
    "varying float vAge;",
    "varying float vH;",
    "varying vec3 vN;",
    "varying vec3 vV;",
    "void main(){",
    "  vec3 p = position;",
    "  float breathe = sin(uTime*0.85 + aAge*4.2) * 0.012 * aAge;",
    "  p += normal * breathe;",
    "  vec4 mv = modelViewMatrix * vec4(p,1.0);",
    "  vAge = aAge;",
    "  vH = clamp(position.y,0.0,1.0);",
    "  vN = normalize(normalMatrix * normal);",
    "  vV = normalize(-mv.xyz);",
    "  gl_Position = projectionMatrix * mv;",
    "}"
  ].join("\n");

  var LEAF_FRAG = [
    "uniform vec3 uBg;",
    "uniform vec3 uInner;",
    "uniform vec3 uOuter;",
    "uniform vec3 uLum;",
    "uniform float uFade;",
    "varying float vAge;",
    "varying float vH;",
    "varying vec3 vN;",
    "varying vec3 vV;",
    "void main(){",
    "  vec3 n = normalize(vN);",
    "  vec3 col = mix(uInner, uOuter, pow(vAge,0.75));",
    "  col *= 0.62 + 0.38*vH;",
    "  float key = abs(dot(n, normalize(vec3(0.34,0.78,0.52))));",
    "  float fill = abs(dot(n, normalize(vec3(-0.62,0.20,0.42))));",
    "  col *= 0.34 + 0.78*key + 0.22*fill;",
    "  float rim = 1.0 - abs(dot(n, normalize(vV)));",
    "  col += uLum * pow(rim,2.6) * 0.55;",
    "  col += vec3(1.0,0.98,0.86) * pow(max(key,0.0),14.0) * 0.16;",
    "  col = mix(col, uBg, uFade);",
    "  gl_FragColor = vec4(col,1.0);",
    "}"
  ].join("\n");

  /* ---- build and run ------------------------------------------------ */

  function scene() {
    var canvas = document.getElementById("gl");
    if (!canvas || typeof THREE === "undefined") { return; }

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: window.innerWidth > 900,
        alpha: false,
        powerPreference: "high-performance"
      });
    } catch (err) {
      canvas.style.display = "none";
      return;
    }
    if (!renderer.getContext()) { canvas.style.display = "none"; return; }

    var small = window.innerWidth < 820;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.4 : 1.8));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(new THREE.Color(COL.bg[0], COL.bg[1], COL.bg[2]), 1);

    var world = new THREE.Scene();
    var cam = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 60);
    cam.position.set(0, 0.28, 2.0);

    /* --- field --- */
    var COUNT = small ? 1700 : 4400;
    var RADIUS = small ? 5.2 : 7.0;

    var fieldMat = new THREE.ShaderMaterial({
      vertexShader: FIELD_VERT,
      fragmentShader: FIELD_FRAG,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uFade: { value: 0 },
        uNear: { value: 1.6 },
        uFar: { value: small ? 7.5 : 10.5 },
        uBg: { value: c3(COL.bg) },
        uDeep: { value: c3(COL.deep) },
        uTip: { value: c3(COL.tip) },
        uLum: { value: c3(COL.lumen) }
      }
    });

    var field = new THREE.InstancedMesh(sproutGeometry(), fieldMat, COUNT);
    field.frustumCulled = false;

    var tints = new Float32Array(COUNT);
    var m4 = new THREE.Matrix4();
    var qt = new THREE.Quaternion();
    var eu = new THREE.Euler();
    var pv = new THREE.Vector3();
    var sv = new THREE.Vector3();

    for (var i = 0; i < COUNT; i++) {
      /* denser near the camera, thinning out toward the fog line */
      var r = RADIUS * Math.sqrt(Math.random());
      var a = Math.random() * Math.PI * 2;
      pv.set(Math.cos(a) * r, -0.02 - Math.random() * 0.03, Math.sin(a) * r - 0.6);
      eu.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.34);
      qt.setFromEuler(eu);
      var s = 0.72 + Math.random() * 0.62;
      sv.set(s, s * (0.8 + Math.random() * 0.5), s);
      m4.compose(pv, qt, sv);
      field.setMatrixAt(i, m4);
      tints[i] = Math.random();
    }
    field.instanceMatrix.needsUpdate = true;
    field.geometry.setAttribute("aTint", new THREE.InstancedBufferAttribute(tints, 1));
    world.add(field);

    /* --- lettuce --- */
    var leafMat = new THREE.ShaderMaterial({
      vertexShader: LEAF_VERT,
      fragmentShader: LEAF_FRAG,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uFade: { value: 1 },
        uBg: { value: c3(COL.bg) },
        uInner: { value: c3(COL.inner) },
        uOuter: { value: c3(COL.outer) },
        uLum: { value: c3(COL.lumen) }
      }
    });

    var headGeo = lettuceGeometry();
    var head = new THREE.Mesh(headGeo, leafMat);
    var HEAD_SCALE = 0.80;
    head.scale.setScalar(HEAD_SCALE);
    head.position.set(0, 0, 0);
    head.visible = false;
    world.add(head);

    /* aim point: the middle of the head, whatever the geometry measured */
    var headMidY = headGeo.boundingBox
      ? (headGeo.boundingBox.min.y + headGeo.boundingBox.max.y) * 0.5 * HEAD_SCALE
      : 0.5;

    /* --- drifting light motes --- */
    var motes = null;
    if (!small) {
      var N = 520;
      var mp = new Float32Array(N * 3);
      for (var q = 0; q < N; q++) {
        mp[q * 3] = (Math.random() - 0.5) * 15;
        mp[q * 3 + 1] = Math.random() * 6.0;
        mp[q * 3 + 2] = (Math.random() - 0.5) * 15 - 1;
      }
      var mg = new THREE.BufferGeometry();
      mg.setAttribute("position", new THREE.BufferAttribute(mp, 3));
      motes = new THREE.Points(mg, new THREE.PointsMaterial({
        size: 0.022,
        color: new THREE.Color(0.86, 0.62, 1.0),
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
      }));
      motes.frustumCulled = false;
      world.add(motes);
    }

    /* --- scroll choreography --- */
    var heroEl = document.querySelector(".hero");
    var lettuceEl = document.getElementById("lettuce");

    var CAM_A = v3([0, 0.30, 2.05]), LOOK_A = v3([0, 0.42, -1.30]);
    var CAM_B = v3([0.45, 2.55, 4.10]), LOOK_B = v3([0, 0.18, -0.70]);
    var CAM_C = v3([0, 0, 0]), LOOK_C = v3([0, 0, 0]);

    function setHeadShot() {
      if (small) {
        /* head sits high in frame, copy runs underneath it */
        CAM_C.set(0, headMidY + 0.72, 2.95);
        LOOK_C.set(0, headMidY - 0.24, 0);
      } else {
        /* look left of the head so it renders to the right of the copy */
        CAM_C.set(0, headMidY + 0.68, 2.40);
        LOOK_C.set(-0.60, headMidY - 0.04, 0);
      }
    }
    setHeadShot();

    var fieldT = 0, headT = 0;
    var camPos = CAM_A.clone(), camLook = LOOK_A.clone();
    var tPos = new THREE.Vector3(), tLook = new THREE.Vector3();
    var mx = 0, my = 0, tmx = 0, tmy = 0;
    var queued = false;

    function readScroll() {
      queued = false;
      var vh = window.innerHeight;
      var heroH = heroEl ? heroEl.offsetHeight : vh;
      fieldT = clamp01(window.scrollY / Math.max(heroH * 0.85, 1));

      if (lettuceEl) {
        var r = lettuceEl.getBoundingClientRect();
        var enter = clamp01(1 - r.top / (vh * 0.80));
        var exit = clamp01((vh * 0.45 - r.bottom) / (vh * 0.55));
        headT = enter * (1 - exit);
      }
    }

    function onScroll() {
      if (!queued) { queued = true; requestAnimationFrame(readScroll); }
    }

    function onResize() {
      small = window.innerWidth < 820;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.4 : 1.8));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      cam.aspect = window.innerWidth / window.innerHeight;
      cam.updateProjectionMatrix();
      setHeadShot();
      readScroll();
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    if (!small && !reduceMotion) {
      window.addEventListener("pointermove", function (e) {
        tmx = (e.clientX / window.innerWidth - 0.5) * 2;
        tmy = (e.clientY / window.innerHeight - 0.5) * 2;
      }, { passive: true });
    }

    readScroll();

    /* --- static render for reduced motion --- */
    if (reduceMotion) {
      fieldMat.uniforms.uTime.value = 1.2;
      cam.position.copy(CAM_A);
      cam.lookAt(LOOK_A);
      renderer.render(world, cam);
      window.addEventListener("resize", function () { renderer.render(world, cam); });
      return;
    }

    /* --- loop --- */
    var clock = new THREE.Clock();
    var paused = false;
    document.addEventListener("visibilitychange", function () {
      paused = document.hidden;
      if (!paused) { clock.getDelta(); }
    });

    function frame() {
      requestAnimationFrame(frame);
      if (paused) { return; }

      var dt = Math.min(clock.getDelta(), 0.05);
      var t = clock.getElapsedTime();

      fieldMat.uniforms.uTime.value = t;
      leafMat.uniforms.uTime.value = t;

      /* the field never disappears entirely, it just recedes into the dark */
      var fade = clamp01((fieldT - 0.20) / 0.32) * 0.78;
      fieldMat.uniforms.uFade.value = Math.min(0.94, fade + headT * 0.14);

      leafMat.uniforms.uFade.value = 1 - headT;
      head.visible = headT > 0.02;
      head.rotation.y += dt * 0.22;
      head.rotation.z = Math.sin(t * 0.4) * 0.035;

      if (motes) {
        var arr = motes.geometry.attributes.position.array;
        for (var n = 1; n < arr.length; n += 3) {
          arr[n] += dt * 0.14;
          if (arr[n] > 6.2) { arr[n] = -0.4; }
        }
        motes.geometry.attributes.position.needsUpdate = true;
        motes.material.opacity = 0.42 * (1 - headT * 0.5);
      }

      tPos.copy(CAM_A).lerp(CAM_B, fieldT).lerp(CAM_C, headT);
      tLook.copy(LOOK_A).lerp(LOOK_B, fieldT).lerp(LOOK_C, headT);

      mx += (tmx - mx) * 0.05;
      my += (tmy - my) * 0.05;
      tPos.x += mx * 0.16;
      tPos.y += -my * 0.10;

      camPos.lerp(tPos, 0.075);
      camLook.lerp(tLook, 0.075);
      cam.position.copy(camPos);
      cam.lookAt(camLook);

      renderer.render(world, cam);
    }
    frame();
  }

  /* ------------------------------------------------------------------ */

  ui();
  try { scene(); } catch (err) {
    var c = document.getElementById("gl");
    if (c) { c.style.display = "none"; }
  }
})();
