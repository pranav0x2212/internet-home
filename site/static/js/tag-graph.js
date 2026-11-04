// Tag graph: one dot per tag (bigger = more posts), a line between tags that
// appear together in a post. Click a dot to open that tag's page.
// Reads /static/index.json, which anna generates on every build.
(async function () {
    var host = document.getElementById('tag-graph');
    if (!host) return;

    var NS = 'http://www.w3.org/2000/svg';
    var index;
    try {
        index = await (await fetch('/static/index.json')).json();
    } catch (e) {
        host.hidden = true;
        return;
    }

    // --- build nodes and links from the posts' tags
    var counts = {}, pairs = {};
    Object.keys(index).forEach(function (url) {
        var tags = (index[url].Frontmatter && index[url].Frontmatter.Tags) || [];
        tags = Array.from(new Set(tags.map(function (t) { return t.trim(); }).filter(Boolean)));
        tags.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
        for (var i = 0; i < tags.length; i++) {
            for (var j = i + 1; j < tags.length; j++) {
                var key = [tags[i], tags[j]].sort().join('\u0000');
                pairs[key] = (pairs[key] || 0) + 1;
            }
        }
    });

    var nodes = Object.keys(counts).map(function (id) {
        return { id: id, count: counts[id], x: 0, y: 0, vx: 0, vy: 0 };
    });
    if (nodes.length < 2) { host.hidden = true; return; }
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });
    var links = Object.keys(pairs).map(function (k) {
        var p = k.split('\u0000');
        return { a: byId[p[0]], b: byId[p[1]], w: pairs[k] };
    });

    var W = host.clientWidth || 640;
    var H = Math.max(320, Math.min(520, W * 0.75));
    nodes.forEach(function (n, i) {
        var ang = (i / nodes.length) * Math.PI * 2;
        n.x = W / 2 + Math.cos(ang) * W * 0.25;
        n.y = H / 2 + Math.sin(ang) * H * 0.25;
    });
    var radius = function (n) { return 4 + 2.2 * Math.sqrt(n.count); };

    // --- tiny force simulation: repel all, pull linked nodes together, gravity to centre
    var alpha = 1;
    function tick() {
        var i, j, n, m, dx, dy, d2, d, f;
        for (i = 0; i < nodes.length; i++) {
            for (j = i + 1; j < nodes.length; j++) {
                n = nodes[i]; m = nodes[j];
                dx = m.x - n.x; dy = m.y - n.y;
                d2 = dx * dx + dy * dy + 0.01; d = Math.sqrt(d2);
                f = (2500 * alpha) / d2;
                n.vx -= (dx / d) * f; n.vy -= (dy / d) * f;
                m.vx += (dx / d) * f; m.vy += (dy / d) * f;
            }
        }
        links.forEach(function (l) {
            dx = l.b.x - l.a.x; dy = l.b.y - l.a.y;
            d = Math.sqrt(dx * dx + dy * dy) + 0.01;
            f = (d - 80) * 0.02 * alpha * Math.min(l.w, 3);
            l.a.vx += (dx / d) * f; l.a.vy += (dy / d) * f;
            l.b.vx -= (dx / d) * f; l.b.vy -= (dy / d) * f;
        });
        nodes.forEach(function (n) {
            n.vx += (W / 2 - n.x) * 0.012 * alpha;
            n.vy += (H / 2 - n.y) * 0.012 * alpha;
            if (!n.fixed) {
                n.x += n.vx; n.y += n.vy;
            }
            n.vx *= 0.6; n.vy *= 0.6;
            n.x = Math.max(24, Math.min(W - 24, n.x));
            n.y = Math.max(16, Math.min(H - 16, n.y));
        });
        alpha *= 0.985;
    }

    // --- draw
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Graph of tags that appear together in posts');
    host.appendChild(svg);

    links.forEach(function (l) {
        l.el = document.createElementNS(NS, 'line');
        l.el.setAttribute('class', 'tg-link');
        l.el.setAttribute('stroke-width', Math.min(1 + l.w * 0.6, 4));
        svg.appendChild(l.el);
    });
    nodes.forEach(function (n) {
        n.el = document.createElementNS(NS, 'a');
        n.el.setAttribute('href', '/tags/' + encodeURIComponent(n.id) + '.html');
        n.el.setAttribute('class', 'tg-node');
        var c = document.createElementNS(NS, 'circle');
        c.setAttribute('r', radius(n));
        var t = document.createElementNS(NS, 'text');
        t.textContent = n.id;
        t.setAttribute('dy', -radius(n) - 4);
        t.setAttribute('text-anchor', 'middle');
        var title = document.createElementNS(NS, 'title');
        title.textContent = n.id + ' (' + n.count + (n.count === 1 ? ' post)' : ' posts)');
        n.el.appendChild(title); n.el.appendChild(c); n.el.appendChild(t);
        svg.appendChild(n.el);

        // highlight this tag and its neighbours on hover/focus
        function on() {
            var near = {}; near[n.id] = true;
            links.forEach(function (l) {
                var hit = l.a === n || l.b === n;
                if (hit) { near[l.a.id] = near[l.b.id] = true; }
                l.el.classList.toggle('tg-hot', hit);
            });
            nodes.forEach(function (o) { o.el.classList.toggle('tg-dim', !near[o.id]); });
        }
        function off() {
            links.forEach(function (l) { l.el.classList.remove('tg-hot'); });
            nodes.forEach(function (o) { o.el.classList.remove('tg-dim'); });
        }
        n.el.addEventListener('mouseenter', on);
        n.el.addEventListener('mouseleave', off);
        n.el.addEventListener('focus', on);
        n.el.addEventListener('blur', off);
    });

    // stretch the layout so it always fills the box, whatever the tags are
    function fit() {
        var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        nodes.forEach(function (n) {
            x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x);
            y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y);
        });
        var padX = 60, padY = 30;
        var sx = (W - 2 * padX) / Math.max(x1 - x0, 1);
        var sy = (H - 2 * padY) / Math.max(y1 - y0, 1);
        nodes.forEach(function (n) {
            n.px = padX + (n.x - x0) * sx;
            n.py = padY + (n.y - y0) * sy;
        });
    }

    function paint() {
        fit();
        links.forEach(function (l) {
            l.el.setAttribute('x1', l.a.px); l.el.setAttribute('y1', l.a.py);
            l.el.setAttribute('x2', l.b.px); l.el.setAttribute('y2', l.b.py);
        });
        nodes.forEach(function (n) {
            n.el.setAttribute('transform', 'translate(' + n.px.toFixed(1) + ',' + n.py.toFixed(1) + ')');
        });
    }

    // settle the layout up front, so the first paint is already tidy
    for (var s = 0; s < 300; s++) tick();
    paint();

    // then a little motion if the visitor hasn't asked for less of it
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
        alpha = 0.3;
        (function loop() {
            tick(); paint();
            if (alpha > 0.002) requestAnimationFrame(loop);
        })();
    }
})();
