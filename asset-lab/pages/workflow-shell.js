import { hashFor, routeById } from '../data/workflow-routes.js';
import { DEFAULT_DEMO_CHARACTER_ASSETS } from '../data/default-demo-character.js';
import {
  DEFAULT_DEMO_PROFILE,
  DEMO_PRODUCTION_STEPS,
} from '../features/demo-production.js';
import { PRODUCTION_SOURCE_OPTIONS } from '../features/production-sources.js';
import {
  backHrefFor,
  breadcrumbsFor,
  exitHrefFor,
  hrefForAction,
  parentIdFor,
} from '../features/workflow-navigation.js';
import { characterSummary, projectSummary } from '../features/asset-library-model.js';

const navItems = Object.freeze([
  { id: 'home', label: '首页' },
  { id: 'library', label: '项目资产' },
  { id: 'demoBuilder', label: '创作' },
]);

const DEMO_CHARACTER_ASSETS = Object.freeze({
  ...DEFAULT_DEMO_CHARACTER_ASSETS,
  frames: DEFAULT_DEMO_CHARACTER_ASSETS.walkFrames,
});

const deliveryJourney = Object.freeze([
  ['exportSelect', '选择动作'],
  ['exportPackage', '通用包'],
  ['exportPreview', 'WASD 预览'],
  ['exportTarget', '目标引擎'],
  ['exportImport', '导入项目'],
]);

const formRoutes = new Set([
  'projectNew',
  'importAsset',
  'exportTarget',
]);

const mediaRoutes = new Set([
  'character',
  'outfit',
  'action',
  'frame',
  'repair',
]);

const listRoutes = new Set([
  'tasks',
  'taskDetail',
  'generationRecord',
  'history',
  'wearable',
  'exportPackage',
  'exportImport',
]);

function el(tagName, options = {}, children = []) {
  const node = document.createElement(tagName);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.href) node.href = options.href;
  if (options.src) node.src = options.src;
  if (options.alt !== undefined) node.alt = options.alt;
  if (options.id) node.id = options.id;
  if (options.type) node.type = options.type;
  for (const [name, value] of Object.entries(options.attributes || {})) node.setAttribute(name, value);
  for (const child of children) if (child) node.append(child);
  return node;
}

function routeIsActive(item, context) {
  if (item.id === context.route.id) return true;
  if (item.id === 'library') return ['projects', 'projectNew', 'library', 'character', 'outfit', 'action', 'frame', 'generationRecord', 'history', 'wearable', 'repair'].includes(context.route.id);
  if (item.id === 'demoBuilder') return context.route.id === 'demoBuilder' || context.route.section === 'create';
  return false;
}

function renderHeader(context) {
  const brand = el('a', { className: 'product-brand', href: hashFor('home') }, [
    el('span', { className: 'product-brand__mark', attributes: { 'aria-hidden': 'true' } }),
    el('span', { className: 'product-brand__name', text: 'Windup' }),
    el('span', { className: 'product-brand__tag', text: '角色资产工作台' }),
  ]);

  const nav = el('nav', { className: 'product-nav', attributes: { 'aria-label': '产品导航' } });
  navItems.forEach((item) => {
    const active = routeIsActive(item, context);
    nav.append(el('a', {
      className: active ? 'is-active' : '',
      href: hashFor(item.id, { params: context.params, query: item.query }),
      text: item.label,
      attributes: active ? { 'aria-current': 'page' } : {},
    }));
  });

  return el('header', { className: 'product-header' }, [brand, nav]);
}

function renderHome(context) {
  const workflowHref = (routeId, query) => hashFor(routeId, {
    params: context.params,
    query,
  });
  const heroActions = el('div', { className: 'hero-actions' }, [
    el('a', { className: 'button button--primary', href: workflowHref('demoBuilder'), text: '开始创作' }),
    el('a', { className: 'button button--ghost', href: workflowHref('library'), text: '查看项目资产' }),
  ]);

  const characterAssets = [
    ['cast-reaper', './brand/characters/reaper-idle.gif', '火焰镰刀骷髅待机动画'],
    ['cast-schoolgirl', './brand/characters/schoolgirl-idle.gif', '黑发少女待机动画'],
    ['cast-boy', './brand/characters/boy-idle.gif', '少年待机动画'],
  ];
  const characterCrowd = el('div', {
    className: 'character-crowd',
    attributes: { 'aria-label': 'Windup 已有透明像素角色资产' },
  }, [
    ...characterAssets.map(([className, src, alt]) => el('img', {
      className: `crowd-character ${className}`,
      alt,
      attributes: { 'data-home-idle': '', 'data-idle-src': src },
    })),
    el('span', { className: 'character-crowd__label', text: '3 ANIMATED CHARACTERS · IDLE' }),
  ]);

  const hero = el('section', { className: 'product-hero' }, [
    el('canvas', { id: 'brandWave', className: 'brand-wave', attributes: { 'aria-hidden': 'true' } }),
    el('div', { className: 'hero-noise', attributes: { 'aria-hidden': 'true' } }),
    el('div', { className: 'hero-copy' }, [
      el('span', { className: 'overline', text: '面向 COCOS CREATOR 与微信小游戏创作者' }),
      el('h1', { id: 'workflowPageTitle', text: '让你的角色，真正登场。', attributes: { tabindex: '-1' } }),
      el('p', { text: '团队可以很小，角色不必因此停在设定里。Windup 把你认定的角色，延展成跨动作保持一致、可以检查与修正、能进入游戏项目的 2D 动作资产。' }),
      heroActions,
    ]),
    characterCrowd,
  ]);

  const heroTransition = el('div', {
    className: 'hero-to-paper',
    attributes: { 'aria-hidden': 'true' },
  }, [
    el('span', { className: 'hero-to-paper__veil' }),
    el('span', { className: 'hero-to-paper__mist hero-to-paper__mist--left' }),
    el('span', { className: 'hero-to-paper__mist hero-to-paper__mist--right' }),
    el('div', { className: 'hero-to-paper__track' }, [
      el('span', { text: 'CHARACTER' }),
      el('i'),
      el('span', { text: 'WORKFLOW' }),
    ]),
    el('div', {
      className: 'hero-to-paper__bird-window',
      attributes: { 'aria-hidden': 'true', 'data-bird-layer': 'transition' },
    }),
  ]);

  const manifesto = el('section', { className: 'home-manifesto', id: 'workflow-story' }, [
    el('div', { className: 'home-manifesto__copy' }, [
      el('span', { className: 'overline', text: 'CREATOR & CHARACTER' }),
      el('h2', { text: '创作者给角色的，不只是一张脸。' }),
      el('p', { text: '你赋予他身份、造型与行动的理由。Windup 不替你决定他应该成为谁，只把重复、易错的生产环节接过去，让你把时间留给真正重要的判断。' }),
    ]),
    el('blockquote', { className: 'home-manifesto__quote' }, [
      el('p', { text: '是你先认出他是谁，Windup 才负责让他学会如何行动。' }),
      el('footer', { text: '人做决定 · 机器完成重复生产' }),
    ]),
  ]);

  const masterImages = [
    ['游侠', '../assets/resources/characters/lirael/base.png'],
    ['骷髅剑士', '../assets/resources/characters/skeleton/base.png'],
    ['少年', DEMO_CHARACTER_ASSETS.base],
  ];
  const masterStage = el('div', { className: 'story-visual master-stage', attributes: { 'aria-label': '角色母版选择示意' } }, [
    el('div', { className: 'master-stage__rail' }, masterImages.map(([name, src], index) => el('figure', {
      className: index === 0 ? 'master-card is-selected' : 'master-card',
    }, [
      el('img', { src, alt: `${name}角色母版` }),
      el('figcaption', {}, [el('b', { text: name }), el('span', { text: index === 0 ? '已锁定身份' : '候选母版' })]),
    ]))),
    el('div', { className: 'visual-note' }, [el('span', { text: '01 / IDENTITY' }), el('b', { text: '同一个人，从母版开始' })]),
  ]);

  const motionFrames = Array.from({ length: 8 }, (_, index) => `../assets/resources/characters/skeleton/views/side/walk-${String(index + 1).padStart(2, '0')}.png`);
  const motionStage = el('div', { className: 'story-visual motion-stage', attributes: { 'aria-label': '行走动作八帧序列' } }, [
    el('div', { className: 'motion-stage__screen' }, [
      el('span', { className: 'motion-stage__axis', attributes: { 'aria-hidden': 'true' } }),
      el('img', { src: motionFrames[3], alt: '角色行走动作预览' }),
      el('div', { className: 'motion-stage__status' }, [el('small', { text: 'WALK / SIDE' }), el('b', { text: '8 FPS' })]),
    ]),
    el('div', { className: 'motion-filmstrip' }, motionFrames.map((src, index) => el('span', {
      className: index === 3 ? 'is-current' : '',
    }, [el('img', { src, alt: '' }), el('small', { text: String(index + 1).padStart(2, '0') })]))),
  ]);

  const reviewStage = el('div', { className: 'story-visual review-stage', attributes: { 'aria-label': '动作检查和局部修正示意' } }, [
    el('div', { className: 'review-stage__heading' }, [
      el('div', {}, [el('small', { text: '动作检查' }), el('b', { text: 'walk / side' })]),
      el('span', { text: '7 / 8 已通过' }),
    ]),
    el('div', { className: 'review-stage__frames' }, motionFrames.map((src, index) => el('span', {
      className: index === 5 ? 'needs-review' : 'is-approved',
    }, [
      el('img', { src, alt: '' }),
      el('small', { text: index === 5 ? '待修正' : '已通过' }),
    ]))),
    el('div', { className: 'review-stage__decision' }, [
      el('span', { text: '第 06 帧' }),
      el('p', { text: '脚步相位不够清晰，保留其余七帧，只返回这一处。' }),
      el('b', { text: '这是你的角色，所以最后一眼由你来看。' }),
    ]),
  ]);

  const deliveryStage = el('div', { className: 'story-visual delivery-stage', attributes: { 'aria-label': '导出至 Cocos Creator 和微信小游戏' } }, [
    el('div', { className: 'delivery-stage__character' }, [
      el('span', { className: 'delivery-stage__orbit', attributes: { 'aria-hidden': 'true' } }),
      el('img', { src: '../assets/resources/characters/lirael/views/side/walk-03.png', alt: '完成动作资产的角色' }),
      el('b', { text: '已准备进入项目' }),
    ]),
    el('div', { className: 'delivery-stage__package' }, [
      el('span', { className: 'package-label', text: 'CHARACTER PACKAGE' }),
      ...['Transparent PNG', 'SpriteSheet', '8 FPS Metadata', 'Cocos Import'].map((item, index) => el('div', {}, [
        el('i', { text: `0${index + 1}` }),
        el('b', { text: item }),
        el('span', { text: '就绪' }),
      ])),
      el('footer', {}, [el('span', { text: 'COCOS CREATOR' }), el('span', { text: '微信小游戏' })]),
    ]),
  ]);

  const storyChapters = [
    {
      number: '01',
      overline: 'IDENTITY BEFORE GENERATION',
      title: '先定下，他是谁。',
      copy: '从一句描述、一张参考图或已有资产出发。你确认脸、体型、造型与关键标志，角色定稿后，它会成为所有动作的同一个起点。',
      link: ['建立角色母版', workflowHref('demoBuilder')],
      visual: masterStage,
    },
    {
      number: '02',
      overline: 'A MOVEMENT WITH A REASON',
      title: '再决定，他如何行动。',
      copy: '不是让角色随机地“动起来”，而是为你的游戏选择真正需要的待机、行走、奔跑与攻击，把每个动作的方向、节奏与循环说清楚。',
      link: ['定制动作清单', workflowHref('demoBuilder', { source: 'existing' })],
      visual: motionStage,
    },
    {
      number: '03',
      overline: 'KEEP WHAT IS ALREADY RIGHT',
      title: '哪里不对，就只回到哪里。',
      copy: '机器先检查尺寸、透明底、锚点与连续性；你只需判断动作是否自然、角色是否还是他自己。一帧或一段失败，不再意味着推倒整套结果。',
      link: ['查看动作检查流程', workflowHref('action', { origin: 'library' })],
      visual: reviewStage,
    },
    {
      number: '04',
      overline: 'ARRIVE IN THE GAME',
      title: '直到他真正抵达游戏。',
      copy: '通过检查的动作才会进入正式资产包。不是下载一组图片就结束，而是带着透明帧、图集和规格数据，进入 Cocos Creator 与微信小游戏的真实项目。',
      link: ['走进交付流程', workflowHref('exportSelect', { origin: 'library' })],
      visual: deliveryStage,
    },
  ];
  const storySection = el('section', { className: 'story-section' }, [
    el('header', { className: 'story-section__heading' }, [
      el('span', { className: 'overline', text: 'FROM A CHARACTER TO YOUR GAME' }),
      el('h2', { text: '一个角色真正登场，要经过四次确认。' }),
      el('p', { text: '每一屏只做一个决定。前一步已经被你认可的东西，不会被下一步悄悄覆盖。' }),
    ]),
    ...storyChapters.map((chapter, index) => el('article', {
      className: index % 2 === 1 ? 'story-chapter is-reversed' : 'story-chapter',
    }, [
      el('canvas', {
        className: 'narrative-dot-field',
        attributes: { 'aria-hidden': 'true', 'data-field-side': index % 2 === 1 ? 'left' : 'right' },
      }),
      el('div', { className: 'story-chapter__copy' }, [
        el('span', { className: 'story-chapter__number', text: chapter.number }),
        el('span', { className: 'overline', text: chapter.overline }),
        el('h3', { text: chapter.title }),
        el('p', { text: chapter.copy }),
        el('a', { className: 'story-link', text: `${chapter.link[0]} →`, href: chapter.link[1] }),
      ]),
      chapter.visual,
    ])),
  ]);

  const values = [
    ['01', '让他始终是他', '角色母版与锁定的造型成为后续动作的共同依据，不让一个角色在第二个动作里变成另一个人。'],
    ['02', '尊重已经做对的部分', '候选与正式资产分开，历史版本被保留，局部失败不再要求创作者为工具的不稳定付出整套代价。'],
    ['03', '让创意抵达玩家', '透明底、统一锚点、图集、命名与引擎规格不应该是小团队放弃一个角色的理由。'],
  ];
  const valueSection = el('section', { className: 'home-values' }, [
    el('header', { className: 'home-values__heading' }, [
      el('span', { className: 'overline', text: 'WHY WINDUP' }),
      el('h2', { text: '不是生成更多相似的人，而是把你认定的那一个角色做下去。' }),
    ]),
    el('div', { className: 'home-values__grid' }, values.map(([number, title, copy]) => el('article', {}, [
      el('span', { text: number }),
      el('h3', { text: title }),
      el('p', { text: copy }),
    ]))),
  ]);

  const ecosystemSection = el('section', { className: 'ecosystem-section' }, [
    el('div', { className: 'ecosystem-section__copy' }, [
      el('span', { className: 'overline', text: 'BUILT FOR THE FIRST REAL MARKET' }),
      el('h2', { text: '为国内小游戏的实际工作方式而做。' }),
      el('p', { text: '首发聚焦会使用引擎、能完成游戏逻辑，却没有完整美术产能的个人开发者与微型团队。我们先把一条真实链路做深，而不是用“支持所有引擎”模糊关键取舍。' }),
      el('div', { className: 'ecosystem-tags' }, ['2D 序列帧', '单角色成套动作', '动作检查与修正', '中文原生工作流'].map((item) => el('span', { text: item }))),
    ]),
    el('div', { className: 'ecosystem-targets' }, [
      el('article', {}, [
        el('img', { className: 'ecosystem-target__icon', src: 'https://cdn.simpleicons.org/cocos/C5DAC7', alt: 'Cocos 图标' }),
        el('small', { text: '目标引擎' }),
        el('b', { text: 'Cocos Creator' }),
        el('p', { text: '图集、帧率、锚点与命名面向实际导入习惯。' }),
        el('span', { text: '首发适配' }),
      ]),
      el('article', {}, [
        el('img', { className: 'ecosystem-target__icon', src: 'https://cdn.simpleicons.org/wechat/C5DAC7', alt: '微信图标' }),
        el('small', { text: '目标平台' }),
        el('b', { text: '微信小游戏' }),
        el('p', { text: '交付的是能进入小游戏项目的资产，而不是只在生成页里好看。' }),
        el('span', { text: '首发生态' }),
      ]),
    ]),
  ]);

  const librarySection = el('section', { className: 'library-story' }, [
    el('div', { className: 'library-story__visual' }, [
      el('span', { className: 'library-story__line', attributes: { 'aria-hidden': 'true' } }),
      ...[
        ['项目', '题材 · 风格 · 目标环境'],
        ['角色', '稳定身份 · 历史版本'],
        ['造型', '母版 · 穿戴 · 多视角'],
        ['动作', '待机 · 行走 · 自定义'],
      ].map(([title, copy], index) => el('div', { className: index === 1 ? 'library-node is-current' : 'library-node' }, [
        el('i', { text: String(index + 1).padStart(2, '0') }),
        el('b', { text: title }),
        el('span', { text: copy }),
      ])),
    ]),
    el('div', { className: 'library-story__copy' }, [
      el('span', { className: 'overline', text: 'A CHARACTER THAT STAYS' }),
      el('h2', { text: '登场不是结束，而是这个角色继续生长的开始。' }),
      el('p', { text: 'Windup 不是用完即走的出图页。角色、造型、动作、帧与历史版本会回到同一个资产库，等待下一次补齐、修正和扩展。' }),
      el('a', { className: 'story-link', href: workflowHref('library'), text: '进入角色资产库 →' }),
    ]),
  ]);

  const closing = el('section', { className: 'home-closing' }, [
    el('div', {}, [
      el('span', { className: 'overline', text: 'BEGIN WITH ONE CHARACTER' }),
      el('h2', { text: '你先想象他。剩下的路，我们陪你把他带进游戏。' }),
      el('p', { text: '从零开始、上传参考图，或从你已经拥有的资产继续。' }),
    ]),
    el('div', { className: 'home-closing__actions' }, [
      el('a', { className: 'button button--primary', href: workflowHref('demoBuilder'), text: '开始创作' }),
      el('a', { className: 'button button--ghost', href: workflowHref('library'), text: '查看项目资产' }),
    ]),
  ]);

  const footer = el('footer', { className: 'product-footer' }, [
    el('a', { className: 'product-brand', href: workflowHref('home') }, [
      el('span', { className: 'product-brand__mark', attributes: { 'aria-hidden': 'true' } }),
      el('span', { className: 'product-brand__name', text: 'Windup' }),
    ]),
    el('p', { text: '面向国内小游戏创作者的 2D 角色动作资产工作流。' }),
    el('nav', { attributes: { 'aria-label': '页脚导航' } }, [
      el('a', { href: workflowHref('home'), text: '首页' }),
      el('a', { href: workflowHref('library'), text: '项目资产' }),
      el('a', { href: workflowHref('demoBuilder'), text: '创作' }),
    ]),
  ]);

  return el('main', { className: 'product-home' }, [
    hero,
    heroTransition,
    manifesto,
    storySection,
    valueSection,
    ecosystemSection,
    librarySection,
    closing,
    footer,
  ]);
}

function renderBreadcrumbs(context) {
  const list = el('ol', { className: 'breadcrumbs' });
  breadcrumbsFor(context).forEach((crumb, index, crumbs) => {
    const current = index === crumbs.length - 1;
    list.append(el('li', {}, [current
      ? el('span', { text: crumb.title, attributes: { 'aria-current': 'page' } })
      : el('a', { href: crumb.href, text: crumb.title })]));
  });
  return el('nav', { attributes: { 'aria-label': '面包屑导航' } }, [list]);
}

function renderPageHeading(context) {
  const exitHref = exitHrefFor(context);
  const showExit = exitHref && ['create', 'delivery', 'review'].includes(context.route.section);
  return el('header', { className: 'workspace-heading' }, [
    el('div', {}, [
      el('span', { className: 'overline', text: context.route.eyebrow }),
      el('h1', { id: 'workflowPageTitle', text: context.route.title, attributes: { tabindex: '-1' } }),
      el('p', { text: context.route.purpose }),
    ]),
    showExit ? el('a', { className: 'text-action', href: exitHref, text: '退出流程' }) : null,
  ]);
}

function renderJourney(context) {
  const journey = context.route.section === 'delivery' ? deliveryJourney : null;
  if (!journey) return null;
  const activeIndex = Math.max(0, journey.findIndex(([id]) => id === context.route.id));
  const items = el('ol', { className: 'journey' });
  journey.forEach(([id, label], index) => {
    const state = index < activeIndex ? 'is-done' : index === activeIndex ? 'is-current' : '';
    items.append(el('li', { className: state }, [
      el('span', { text: String(index + 1).padStart(2, '0') }),
      el('strong', { text: label }),
    ]));
  });
  return items;
}

function renderProjectHub(context) {
  return el('div', { className: 'project-hub' }, [
    el('article', { className: 'project-spotlight' }, [
      el('div', { className: 'project-spotlight__copy' }, [
        el('span', { className: 'status-chip', text: '进行中' }),
        el('h2', { text: '少年角色 · 角色项目' }),
        el('p', { text: '用同一份身份母版完成待机、侧视行走、逐帧审核与 Cocos 交付。' }),
        el('a', { className: 'button button--primary', href: hashFor('library', { params: context.params }), text: '进入项目工作区' }),
      ]),
      el('div', { className: 'project-spotlight__art' }, [
        el('img', { src: DEMO_CHARACTER_ASSETS.walkFrames[3], alt: '默认少年角色' }),
      ]),
      el('dl', { className: 'project-stats' }, [
        el('div', {}, [el('dt', { text: '角色' }), el('dd', { text: '01' })]),
        el('div', {}, [el('dt', { text: '动作' }), el('dd', { text: '02' })]),
        el('div', {}, [el('dt', { text: '正式帧' }), el('dd', { text: '16' })]),
      ]),
    ]),
    el('aside', { className: 'project-next' }, [
      el('span', { className: 'overline', text: 'NEXT STEP' }),
      el('h3', { text: '继续审核侧视行走动作' }),
      el('p', { text: '生成已结束，自动质检完成。下一步确认 8 个正式帧。' }),
      el('a', { href: './review.html?character=boy&view=side&action=walk', text: '进入动作检查台 →' }),
    ]),
  ]);
}

function renderLibrary(context, libraryState = {}) {
  if (libraryState.status === 'loading') {
    return el('section', { className: 'asset-library-state', attributes: { 'aria-live': 'polite' } }, [
      el('span', { className: 'overline', text: 'PROJECT ASSETS' }),
      el('h2', { text: '正在同步项目资产…' }),
    ]);
  }
  if (libraryState.status === 'error') {
    return el('section', { className: 'asset-library-state', attributes: { 'aria-live': 'polite' } }, [
      el('span', { className: 'overline', text: 'PROJECT ASSETS' }),
      el('h2', { text: '暂时无法读取项目资产' }),
      el('p', { text: libraryState.message || '请确认本地服务已启动。' }),
      el('button', { className: 'button button--primary', type: 'button', text: '重新读取', attributes: { 'data-library-retry': '' } }),
    ]);
  }

  const characters = libraryState.characters || [];
  if (!characters.length) {
    return el('section', { className: 'asset-library-state' }, [
      el('span', { className: 'overline', text: 'PROJECT ASSETS' }),
      el('h2', { text: '还没有角色资产' }),
      el('a', { className: 'button button--primary', href: hashFor('demoBuilder'), text: '创建第一个角色' }),
    ]);
  }

  const selectedId = context.query.get('character');
  const character = characters.find((item) => item.id === selectedId) || characters[0];
  const summary = characterSummary(character);
  const project = projectSummary(characters);
  const assetUrl = libraryState.assetUrl || ((path) => path);
  const shelf = el('div', { className: 'asset-shelf' }, summary.entries.map((asset) => {
    const query = new URLSearchParams({ character: character.id, view: asset.view, action: asset.action });
    return el('a', { className: 'asset-card', href: `./review.html?${query}` }, [
      el('span', { className: 'asset-card__preview' }, [el('img', { src: assetUrl(asset.asset.frames[0]), alt: `${asset.actionLabel}动作资产` })]),
      el('span', { className: 'asset-card__copy' }, [
        el('strong', { text: asset.actionLabel }),
        el('small', { text: `${asset.viewLabel} · ${asset.frames} 帧` }),
      ]),
    ]);
  }));
  if (!summary.entries.length) shelf.append(el('p', { className: 'asset-shelf__empty', text: '当前角色还没有正式动作资产。' }));

  return el('div', { className: 'asset-library' }, [
    el('aside', { className: 'asset-browser' }, [
      el('header', {}, [
        el('span', { className: 'overline', text: 'PROJECT ASSETS' }),
        el('h2', { text: '角色资产' }),
        el('p', { text: `${project.characterCount} 个角色 · ${project.entryCount} 组动作 · ${project.frameCount} 帧` }),
      ]),
      el('nav', { attributes: { 'aria-label': '角色资产' } }, characters.map((item) => {
        const itemSummary = characterSummary(item);
        return el('a', {
          className: item.id === character.id ? 'is-active' : '',
          href: hashFor('library', { params: context.params, query: { character: item.id } }),
        }, [el('span', { text: '角色' }), el('strong', { text: item.label }), el('small', { text: `${itemSummary.entries.length} 组动作` })]);
      })),
      el('a', { className: 'asset-browser__create', href: hashFor('demoBuilder', { params: context.params }), text: '＋ 新建资产' }),
    ]),
    el('section', { className: 'asset-workspace' }, [
      el('header', { className: 'asset-workspace__heading' }, [
        el('div', {}, [el('span', { className: 'overline', text: 'CURRENT CHARACTER' }), el('h2', { text: character.label }), el('p', { text: character.description || character.cardData?.description || '当前角色的母版与正式动作资产。' })]),
        el('a', { className: 'button button--primary', href: hashFor('demoBuilder', { params: context.params, query: { source: 'existing', character: character.id } }), text: '补充资产' }),
      ]),
      el('div', { className: 'master-overview' }, [
        el('div', { className: 'master-overview__preview' }, [el('img', { src: assetUrl(character.base), alt: `${character.label}角色母版` })]),
        el('div', { className: 'master-overview__copy' }, [
          el('span', { className: 'status-chip', text: '母版已入库' }),
          el('h3', { text: `${character.label} · 默认造型` }),
          el('p', { text: `已连接 ${summary.entries.length} 组动作资产，共 ${summary.frameCount} 帧。` }),
        ]),
      ]),
      el('header', { className: 'shelf-heading' }, [el('div', {}, [el('span', { className: 'overline', text: 'ACTION ASSETS' }), el('h3', { text: '动作资产' })])]),
      shelf,
    ]),
  ]);
}

function renderDemoSourceChoices(mode) {
  return el('div', { className: `demo-source-grid demo-source-grid--${mode}` }, DEMO_SOURCE_OPTIONS.map((source, index) => (
    el('button', {
      className: 'demo-source-card',
      type: 'button',
      attributes: { 'data-demo-source': source.id },
    }, [
      el('span', { text: String(index + 1).padStart(2, '0') }),
      el('small', { text: source.eyebrow }),
      el('h3', { text: source.label }),
      el('p', { text: source.copy }),
      el('b', { text: '从这里开始 →' }),
    ])
  )));
}

function renderDemoSourceSummary(source) {
  if (!source) return null;
  return el('div', { className: 'demo-source-summary' }, [
    el('span', {}, [el('small', { text: '角色来源' }), el('b', { text: source.label })]),
    el('p', { text: source.copy }),
    el('button', { type: 'button', text: '重新选择', attributes: { 'data-demo-change-source': '' } }),
  ]);
}

function demoCanvasNodeState(snapshot, index) {
  if (snapshot.completed) return { className: 'is-revealed is-done', label: '完成' };
  if (snapshot.status === 'draft') {
    return index === 0
      ? { className: 'is-revealed is-current', label: '等待确认' }
      : { className: 'is-locked', label: '等待上一步' };
  }
  if (index < snapshot.stepIndex) return { className: 'is-revealed is-done', label: '完成' };
  if (index === snapshot.stepIndex) {
    const label = {
      action: '生成中',
      identity: '锁定中',
      master: '生成中',
      package: '打包中',
      promote: '采用中',
      quality: '检查中',
      slice: '切分中',
    }[DEMO_PRODUCTION_STEPS[index]?.id] || '处理中';
    return { className: 'is-revealed is-current', label };
  }
  return { className: 'is-locked', label: '等待上一步' };
}

function renderDemoNode(snapshot, index, modifier, eyebrow, title, children, tagName = 'article', options = {}) {
  const state = demoCanvasNodeState(snapshot, index);
  return el(tagName, {
    className: `production-node production-node--${modifier} ${state.className}`,
    id: options.id,
    attributes: {
      ...(options.attributes || {}),
      'data-canvas-node-index': String(index),
      'data-demo-step': DEMO_PRODUCTION_STEPS[index]?.id || '',
    },
  }, [
    el('header', { className: 'production-node__header' }, [
      el('div', {}, [el('span', { text: `0${index + 1}` }), el('small', { text: eyebrow })]),
      el('b', { text: state.label, attributes: { 'data-demo-step-state': '' } }),
    ]),
    el('h2', { text: title }),
    ...children,
  ]);
}

function renderDemoCanvas(snapshot = { profile: DEFAULT_DEMO_PROFILE, status: 'draft', stepIndex: -1 }) {
  const profile = snapshot.profile || DEFAULT_DEMO_PROFILE;
  const fieldsDisabled = snapshot.status !== 'draft' ? { disabled: '' } : {};
  const identity = snapshot.source
    ? renderDemoNode(snapshot, 0, 'identity', 'CHARACTER BRIEF', '先确定，他是谁。', [
      renderDemoSourceSummary(snapshot.source),
      el('p', { className: 'production-node__lead', text: '角色判断由你完成。确认后，Windup 沿同一身份母版继续生产。' }),
      el('div', { className: 'production-identity-fields' }, [
        el('label', {}, [
          el('span', { text: '角色姓名' }),
          el('input', { attributes: { ...fieldsDisabled, name: 'name', maxlength: '40', required: '', value: profile.name } }),
        ]),
        el('label', {}, [
          el('span', { text: '游戏定位' }),
          el('input', { attributes: { ...fieldsDisabled, name: 'role', maxlength: '100', required: '', value: profile.role } }),
        ]),
        el('label', {}, [
          el('span', { text: '角色识别点' }),
          el('textarea', { text: profile.description, attributes: { ...fieldsDisabled, name: 'description', maxlength: '240', required: '', rows: '4' } }),
        ]),
        el('label', {}, [
          el('span', { text: '视觉约束' }),
          el('textarea', { text: profile.style, attributes: { ...fieldsDisabled, name: 'style', maxlength: '180', required: '', rows: '3' } }),
        ]),
      ]),
      el('div', { className: 'production-node__action' }, snapshot.status === 'draft' ? [
        el('span', {}, [el('b', { text: '默认生产包' }), el('small', { text: '待机 + 侧视行走 · 各 8 帧 · 8 FPS' })]),
        el('button', { className: 'button button--primary', type: 'submit', text: '确认角色并开始生产' }),
      ] : [
        el('span', {}, [el('b', { text: profile.name, attributes: { 'data-demo-profile-name': '' } }), el('small', { text: snapshot.completed ? '生产链已完成' : '身份已提交，正在生产' })]),
        snapshot.completed ? el('button', { className: 'button button--ghost', type: 'button', text: '重新生成', attributes: { 'data-demo-reset': '' } }) : null,
      ]),
    ], 'form', { id: 'demoCharacterForm' })
    : renderDemoNode(snapshot, 0, 'identity source', 'CHOOSE A SOURCE', '这个角色，从哪里开始？', [
      el('p', { className: 'production-node__lead', text: '三条起点只决定第一份身份依据；后续母版、动作、检查与交付使用同一条生产链。' }),
      renderDemoSourceChoices('canvas'),
    ]);

  const master = renderDemoNode(snapshot, 1, 'master', 'IDENTITY MASTER', '身份母版', [
    el('div', { className: 'production-master-preview' }, [
      el('span', { className: 'production-master-preview__grid', attributes: { 'aria-hidden': 'true' } }),
      el('img', { src: DEMO_CHARACTER_ASSETS.base, alt: '角色侧视身份母版' }),
      el('small', { text: 'FEET BASELINE · 256 × 256' }),
    ]),
    el('dl', { className: 'production-specs' }, [
      el('div', {}, [el('dt', { text: '视角' }), el('dd', { text: '侧视 · 朝右' })]),
      el('div', {}, [el('dt', { text: '背景' }), el('dd', { text: '透明 Alpha' })]),
      el('div', {}, [el('dt', { text: '身份' }), el('dd', { text: '已锁定' })]),
    ]),
  ]);

  const action = renderDemoNode(snapshot, 2, 'action', 'ACTION DIRECTION', '待机与侧视行走', [
    el('div', { className: 'production-action-preview production-action-preview--pair' }, [
      el('figure', {}, [el('img', { src: DEMO_CHARACTER_ASSETS.idleFrames[3], alt: '呼吸待机关键姿态' }), el('figcaption', { text: 'IDLE' })]),
      el('figure', {}, [el('img', { src: DEMO_CHARACTER_ASSETS.walkFrames[3], alt: '侧视行走关键姿态' }), el('figcaption', { text: 'WALK' })]),
    ]),
    el('div', { className: 'production-action-facts' }, [
      el('span', {}, [el('small', { text: '动作' }), el('b', { text: 'idle + walk / side' })]),
      el('span', {}, [el('small', { text: '播放' }), el('b', { text: '8 FPS · LOOP' })]),
      el('span', {}, [el('small', { text: '来源' }), el('b', { text: '任务批次 WU-0716-01' })]),
    ]),
  ]);

  const frames = renderDemoNode(snapshot, 3, 'frames', 'NORMALIZED FRAMES', '行走的八个相位，成为一套动作。', [
    el('p', { className: 'production-node__lead', text: '生成结果按八个相位逐帧落入画布，再统一透明底、脚底锚点和命名。' }),
    el('div', { className: 'production-frame-grid', attributes: { 'aria-label': '侧视行走八帧资产' } }, DEMO_CHARACTER_ASSETS.frames.map((src, index) => (
      el('span', {}, [el('img', { src, alt: `行走动作第 ${index + 1} 帧` }), el('small', { text: String(index + 1).padStart(2, '0') })])
    ))),
    el('footer', { className: 'production-node__meta' }, [el('span', { text: '256 × 256' }), el('span', { text: 'PNG · Alpha' }), el('span', { text: 'feet-center' })]),
  ]);

  const checks = ['透明画布', '脚底基线', '主体高度', '相邻位移', '轮廓波动', '循环接缝'];
  const quality = renderDemoNode(snapshot, 4, 'quality', 'QUALITY GATE', '自动检查', [
    el('div', { className: 'production-quality-score' }, [el('strong', { text: '6/6' }), el('span', { text: '规则通过' })]),
    el('ul', { className: 'production-quality-list' }, checks.map((check) => el('li', {}, [
      el('i', { text: '✓' }), el('span', { text: check }), el('b', { text: '通过' }),
    ]))),
    el('a', { className: 'production-node__link', href: './review.html?character=boy&view=side&action=walk', text: '打开逐帧检查 →' }),
  ]);

  const promote = renderDemoNode(snapshot, 5, 'promote', 'FORMAL ASSET', '采用为正式版本', [
    el('p', { className: 'production-node__lead', text: '候选结果不会覆盖正式资产。确认采用后，旧版本仍可回退。' }),
    el('div', { className: 'production-version-stack' }, [
      el('figure', {}, [el('img', { src: DEMO_CHARACTER_ASSETS.frames[1], alt: '' }), el('figcaption', { text: '候选批次' })]),
      el('span', { text: '→' }),
      el('figure', { className: 'is-formal' }, [el('img', { src: DEMO_CHARACTER_ASSETS.frames[1], alt: '' }), el('figcaption', { text: '正式 v1' })]),
    ]),
    el('span', { className: 'production-adoption-note', text: '来源、规格和检查结果已随版本保存' }),
  ]);

  const packageNode = renderDemoNode(snapshot, 6, 'package', 'READY FOR GAME', '进入你的游戏项目。', [
    el('div', { className: 'production-targets' }, [
      el('span', {}, [el('img', { src: 'https://cdn.simpleicons.org/cocos/263F2D', alt: 'Cocos 图标' }), el('b', { text: 'Cocos Creator' })]),
      el('span', {}, [el('img', { src: 'https://cdn.simpleicons.org/wechat/263F2D', alt: '微信图标' }), el('b', { text: '微信小游戏' })]),
    ]),
    el('ul', { className: 'production-deliverables' }, [
      ['透明 PNG', '16 帧'], ['Sprite Sheet', '2 张'], ['动作 Metadata', '8 FPS'], ['锚点说明', 'feet-center'],
    ].map(([label, value]) => el('li', {}, [el('span', { text: label }), el('b', { text: value })]))),
    el('div', {
      className: snapshot.completed ? 'production-result-actions is-visible' : 'production-result-actions',
      attributes: { 'data-demo-result': '', ...(snapshot.completed ? {} : { hidden: '' }) },
    }, [
      el('a', { className: 'button button--primary', href: './review.html?character=boy&view=side&action=walk', text: '检查动作' }),
      el('a', { className: 'button button--ghost', href: hashFor('library', { query: { character: 'boy' } }), text: '查看资产' }),
      el('a', { className: 'production-node__link', href: '#', text: '下载 metadata', attributes: { 'data-demo-metadata-download': '' } }),
    ]),
  ]);

  const nodes = [identity, master, action, frames, quality, promote, packageNode];
  const connectors = Array.from({ length: 6 }, (_, index) => el('span', {
    className: `production-connector production-connector--${index + 1}`,
    attributes: { 'aria-hidden': 'true', 'data-canvas-connector-index': String(index) },
  }));

  return el('section', {
    className: snapshot.completed ? 'production-studio is-complete' : 'production-studio',
    attributes: { 'data-demo-runner': '', 'data-production-status': snapshot.status },
  }, [
    el('div', {
      className: 'production-canvas',
      attributes: { 'data-guided-canvas': '', tabindex: '0', 'aria-label': '创作画布，可拖动和缩放' },
    }, [
      el('div', { className: 'production-canvas__world', attributes: { 'data-guided-canvas-world': '' } }, [
        el('span', { className: 'production-canvas__lane', attributes: { 'aria-hidden': 'true' } }),
        ...connectors,
        ...nodes,
      ]),
      el('div', { className: 'production-canvas__zoom', attributes: { 'aria-label': '画布缩放' } }, [
        el('button', { type: 'button', text: '−', attributes: { 'aria-label': '缩小画布', 'data-canvas-zoom-out': '' } }),
        el('output', { text: '100%', attributes: { 'aria-live': 'polite', 'data-canvas-zoom-label': '' } }),
        el('button', { type: 'button', text: '+', attributes: { 'aria-label': '放大画布', 'data-canvas-zoom-in': '' } }),
      ]),
      el('div', { className: 'production-canvas__progress' }, [
        el('span', {}, [el('b', { text: `${snapshot.progress}%`, attributes: { 'data-demo-progress-text': '' } }), el('small', { text: 'PRODUCTION' })]),
        el('i', {}, [el('em', { attributes: { 'data-demo-progress-bar': '' } })]),
      ]),
      el('div', { className: 'production-canvas__map', attributes: { 'aria-label': '生产链导航' } }, DEMO_PRODUCTION_STEPS.map((step, index) => {
        const state = demoCanvasNodeState(snapshot, index);
        return el('button', {
          className: state.className,
          type: 'button',
          text: String(index + 1).padStart(2, '0'),
          attributes: { 'aria-label': `聚焦${step.label}`, 'data-canvas-jump': String(index), ...(state.className.includes('is-locked') ? { disabled: '' } : {}) },
        });
      })),
      el('span', { className: 'production-canvas__hint', text: '拖动画布 · 双指平移 · ⌘/Ctrl 滚轮缩放 · F 聚焦' }),
    ]),
  ]);
}

function renderDemoBuilder(snapshot) {
  return renderDemoCanvas(snapshot);
}

function renderProductionEntry(context) {
  const requested = context.query.get('source');
  return el('main', { className: 'product-workspace production-entry' }, [
    el('header', { className: 'page-heading' }, [
      el('span', { className: 'overline', text: 'REAL GENERATION WORKFLOWS' }),
      el('h1', { text: '选择真实生产入口' }),
      el('p', { text: '每条入口都会进入后端任务、真实轮询和候选审核；不会再用固定角色或定时器伪造结果。' }),
    ]),
    el('div', { className: 'demo-source-grid demo-source-grid--canvas' }, PRODUCTION_SOURCE_OPTIONS.map((source, index) => (
      el('a', {
        className: requested === source.id ? 'demo-source-card is-selected' : 'demo-source-card',
        href: source.id === 'existing' && context.query.get('character')
          ? `${source.href}?character=${encodeURIComponent(context.query.get('character'))}`
          : source.href,
        attributes: { 'data-production-source': source.id },
      }, [
        el('span', { text: String(index + 1).padStart(2, '0') }),
        el('small', { text: source.eyebrow }),
        el('h3', { text: source.label }),
        el('p', { text: source.copy }),
        el('b', { text: `${source.action} →` }),
      ])
    ))),
    el('p', { className: 'production-entry__note', text: '生成费用只会在你完成 Key 验证并明确提交后产生。候选资产必须手动采用，才会进入正式角色库。' }),
  ]);
}

function renderForm(context) {
  const form = el('div', { className: 'form-architecture' });
  context.route.regions.forEach((region, index) => form.append(el('section', { className: 'form-block' }, [
    el('span', { text: String(index + 1).padStart(2, '0') }),
    el('div', {}, [
      el('label', { text: region }),
      index === context.route.regions.length - 1
        ? el('div', { className: 'segmented-field' }, [el('button', { type: 'button', text: '默认' }), el('button', { type: 'button', text: '可调整' })])
        : el('div', { className: 'input-shell', text: '等待输入或选择' }),
    ]),
  ])));
  return form;
}

function renderMediaWorkbench(context) {
  const items = context.route.regions.slice(1);
  return el('div', { className: 'media-workbench' }, [
    el('section', { className: 'media-stage' }, [
      el('header', {}, [el('span', { className: 'overline', text: 'CURRENT FOCUS' }), el('h2', { text: context.route.regions[0] || context.route.title })]),
      el('div', { className: 'media-stage__canvas' }, [
        el('img', { src: DEMO_CHARACTER_ASSETS.base, alt: '当前角色资产预览' }),
        el('span', { text: '当前资产预览' }),
      ]),
    ]),
    el('aside', { className: 'inspection-panel' }, [
      el('header', {}, [el('span', { className: 'overline', text: 'SCOPE' }), el('h3', { text: '本页检查范围' })]),
      ...items.map((item, index) => el('div', { className: 'inspection-row' }, [
        el('span', { text: String(index + 1).padStart(2, '0') }),
        el('strong', { text: item }),
        el('small', { text: index === 0 ? '当前' : '待确认' }),
      ])),
    ]),
  ]);
}

function renderListWorkbench(context) {
  const list = el('div', { className: 'record-list' });
  context.route.regions.forEach((region, index) => list.append(el('section', { className: index === 0 ? 'is-current' : '' }, [
    el('span', { text: String(index + 1).padStart(2, '0') }),
    el('div', {}, [el('strong', { text: region }), el('small', { text: index === 0 ? '当前需要关注' : '流程信息' })]),
    el('b', { text: index === 0 ? '进行中' : '—' }),
  ])));
  return list;
}

function renderCanvas(context) {
  return el('div', { className: 'playtest-layout' }, [
    el('section', { className: 'playtest-stage' }, [
      el('img', { className: 'playtest-stage__scene', src: '../artifacts/raw/scene-v1.png', alt: 'WASD 预览场景' }),
      el('img', { className: 'playtest-stage__character', src: DEMO_CHARACTER_ASSETS.walkFrames[3], alt: '试玩角色' }),
      el('span', { className: 'playtest-label', text: 'WASD PREVIEW' }),
    ]),
    el('aside', { className: 'playtest-controls' }, context.route.regions.slice(1).map((region, index) => el('div', {}, [
      el('span', { text: `0${index + 1}` }),
      el('strong', { text: region }),
    ]))),
  ]);
}

function renderSelection(context) {
  const grid = el('div', { className: 'selection-grid' });
  context.route.regions.forEach((region, index) => grid.append(el('button', { className: index === 0 ? 'is-selected' : '', type: 'button' }, [
    el('span', { text: String(index + 1).padStart(2, '0') }),
    el('strong', { text: region }),
    el('small', { text: index === 0 ? '已选择' : '点击选择' }),
  ])));
  return grid;
}

function renderBody(context, libraryState) {
  if (context.route.id === 'projects') return renderProjectHub(context);
  if (context.route.id === 'library') return renderLibrary(context, libraryState);
  if (context.route.id === 'demoBuilder') return renderProductionEntry(context);
  if (context.route.layout === 'canvas') return renderCanvas(context);
  if (formRoutes.has(context.route.id)) return renderForm(context);
  if (mediaRoutes.has(context.route.id)) return renderMediaWorkbench(context);
  if (listRoutes.has(context.route.id)) return renderListWorkbench(context);
  return renderSelection(context);
}

function renderActions(context) {
  if (context.route.id === 'demoBuilder' || !context.route.actions.length) return null;
  const bar = el('div', { className: 'workspace-actions' });
  context.route.actions.forEach((action) => bar.append(el('a', {
    className: action.kind === 'primary' ? 'button button--primary' : 'button button--ghost',
    href: hrefForAction(action, context.params, context.query),
    text: action.label,
  })));
  return bar;
}

function renderWorkspace(context, libraryState) {
  if (context.route.id === 'demoBuilder') {
    return renderProductionEntry(context);
  }
  const parent = parentIdFor(context) ? routeById(parentIdFor(context)) : null;
  return el('main', { className: 'product-workspace' }, [
    renderBreadcrumbs(context),
    renderPageHeading(context),
    renderJourney(context),
    renderBody(context, libraryState),
    renderActions(context),
    backHrefFor(context) ? el('footer', { className: 'workspace-footer' }, [
      el('a', { href: backHrefFor(context), text: `← 返回${parent?.title || '上一级'}` }),
      el('span', { text: '当前页面只承载一个明确任务' }),
    ]) : null,
  ]);
}

export function renderWorkflowShell(root, context, options = {}) {
  root.replaceChildren();
  root.dataset.routeId = context.route.id;
  root.append(renderHeader(context));
  root.append(context.route.id === 'home' ? renderHome(context) : renderWorkspace(context, options.libraryState));
}
