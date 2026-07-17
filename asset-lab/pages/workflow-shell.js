import { hashFor, routeById } from '../data/workflow-routes.js';
import {
  DEFAULT_DEMO_PROFILE,
  DEMO_CHARACTER_ASSETS,
  DEMO_SOURCE_OPTIONS,
} from '../features/demo-production.js';
import { NATURAL_CREATION_DURATION_MS } from '../features/natural-creation.js';
import { characterCatalog } from '../data/character-catalog.js';
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

const deliveryJourney = Object.freeze([
  ['exportSelect', '选择导出动作'],
  ['exportPackage', '通用资源包'],
  ['exportPreview', 'WASD 画布预览'],
  ['exportTarget', '选择目标引擎'],
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
  const isSvg = tagName === 'svg';
  const node = isSvg
    ? document.createElementNS('http://www.w3.org/2000/svg', tagName)
    : document.createElement(tagName);
  if (options.className) {
    if (isSvg) node.setAttribute('class', options.className);
    else node.className = options.className;
  }
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

function renderStudioBar(context, projectContext, workflowState = {}, studioMode = null) {
  const nav = el('nav', { className: 'studio-bar__nav', attributes: { 'aria-label': '创作导航' } }, navItems.map((item) => el('a', {
    className: routeIsActive(item, context) ? 'is-active' : '',
    href: hashFor(item.id, { params: context.params }),
    text: item.label,
    attributes: item.id === 'demoBuilder' ? { 'data-start-creation': '', 'aria-label': '新建一次创作' } : {},
  })));
  return el('header', { className: 'studio-bar' }, [
    el('div', { className: 'studio-bar__left' }, [
      studioMode === 'workflow' ? el('button', {
        className: 'studio-bar__mode-back',
        type: 'button',
        text: '返回',
        attributes: { 'data-studio-mode-back': '', 'aria-label': '返回创作方式选择' },
      }) : null,
      el('a', { className: 'studio-bar__brand', href: hashFor('home') }, [
        el('span', { className: 'product-brand__mark', attributes: { 'aria-hidden': 'true' } }),
        el('b', { text: 'Windup' }),
      ]),
      projectContext ? el('span', { className: 'studio-bar__project' }, [
        el('b', { text: projectContext.projectName || '未命名项目' }),
        el('small', { text: `${projectLabels[projectContext.view] || '默认视角'} · ${projectLabels[projectContext.directions] || '默认方向'} · ${projectContext.canvasSize || '256'}²` }),
      ]) : el('span', { className: 'studio-bar__project' }, [
        el('b', { text: studioMode === 'natural' ? 'AI 资产生成' : studioMode === 'workflow' ? '节点工作流' : '创作中心' }),
        el('small', { text: studioMode === 'natural' ? 'AI 智能生成 · 一句话创建' : studioMode === 'workflow' ? '选择素材来源并逐步确认' : '选择一种创作方式' }),
      ]),
    ]),
    el('div', { className: 'studio-bar__right' }, [
      nav,
      el('div', { className: 'studio-bar__actions' }, [
        el('button', { type: 'button', text: '全屏', attributes: { 'data-browser-fullscreen': '', 'aria-label': '切换浏览器全屏' } }),
        el('button', { type: 'button', attributes: { 'data-workflow-library-open': '' } }, [
          el('span', { text: '流程库' }),
          el('i', { text: String((workflowState.items || []).length), attributes: { 'aria-label': `${(workflowState.items || []).length} 个已保存工作流` } }),
        ]),
        projectContext ? el('button', { type: 'button', text: '编辑项目', attributes: { 'data-edit-project': '' } }) : null,
        projectContext ? el('button', { type: 'button', text: '整理节点', attributes: { 'data-node-arrange': '' } }) : null,
        projectContext ? el('button', { type: 'button', text: '重置流程', attributes: { 'data-demo-reset': '' } }) : null,
      ]),
    ]),
  ]);
}

function renderWorkflowLibrary(workflowState = {}) {
  if (!workflowState.open) return null;
  const templates = workflowState.items || [];
  return el('div', { className: 'workflow-library-layer', attributes: { 'data-workflow-library-layer': '' } }, [
    el('section', { className: 'workflow-library-panel', attributes: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'workflowLibraryTitle' } }, [
      el('header', {}, [
        el('div', {}, [el('span', { className: 'overline', text: 'REUSABLE WORKFLOWS' }), el('h2', { id: 'workflowLibraryTitle', text: '工作流' }), el('p', { text: '保存已验证的节点配置，为新角色自动重放生成流程。' })]),
        el('button', { type: 'button', text: '×', attributes: { 'data-workflow-library-close': '', 'aria-label': '关闭工作流库' } }),
      ]),
      workflowState.status === 'loading' ? el('div', { className: 'workflow-library-empty' }, [el('b', { text: '正在读取工作流…' })]) : null,
      workflowState.status === 'error' ? el('div', { className: 'workflow-library-empty' }, [el('b', { text: '工作流库读取失败' }), el('p', { text: workflowState.message || '请稍后重新读取。' })]) : null,
      workflowState.status === 'ready' && !templates.length ? el('div', { className: 'workflow-library-empty' }, [
        el('b', { text: '还没有保存的工作流' }),
        el('p', { text: '完整跑完一次母版、Idle 和 Walk，在最终节点点击「保存工作流」。' }),
      ]) : null,
      templates.length ? el('div', { className: 'workflow-library-list' }, templates.map((template) => el('article', {}, [
        el('header', {}, [
          el('span', {}, [el('b', { text: template.name }), el('small', { text: `v${template.version} · 已运行 ${template.runCount || 0} 次` })]),
          el('i', { text: template.execution?.mode === 'automatic' ? '自动运行' : '分步确认' }),
        ]),
        el('dl', {}, [
          el('div', {}, [el('dt', { text: '视角' }), el('dd', { text: projectLabels[template.project.view] || template.project.view })]),
          el('div', {}, [el('dt', { text: '规格' }), el('dd', { text: `${template.project.canvasSize} · ${template.pipeline.fps} FPS` })]),
          el('div', {}, [el('dt', { text: '节点' }), el('dd', { text: template.pipeline.actions.join(' + ') })]),
        ]),
        el('button', { type: 'button', text: '进入并复用', attributes: { 'data-workflow-enter': template.id } }),
      ]))) : null,
      workflowState.message ? el('footer', { text: workflowState.message }) : null,
    ]),
  ]);
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
    ['cast-samurai-walk', '../assets/resources/characters/samurai/views/side/walk.gif', '武士行走动画'],
    ['cast-knight', '../assets/resources/characters/knight/views/side/idle.gif', '骑士待机动画'],
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
    el('span', { className: 'character-crowd__label', text: '5 ANIMATED CHARACTERS · IDLE & WALK' }),
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
    ['武士', '../assets/resources/characters/samurai/base.png'],
    ['骑士', '../assets/resources/characters/knight/base.png'],
    ['少年', DEMO_CHARACTER_ASSETS.base],
    ['点灯人', '../assets/resources/character/frames/walk-01.png'],
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
      el('p', { text: '生成已结束，自动质检完成。下一步确认行走动作的 8 个正式帧。' }),
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
      el('p', { text: libraryState.message || '请确认资产服务已启动。' }),
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
      attributes: { 'data-demo-source': source.id, 'data-pointer-card': '' },
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


const workbenchStages = Object.freeze([
  ['角色定义', '身份与来源'],
  ['母版确认', '人工选择'],
  ['动作生成', '规格与候选'],
  ['动作检查', '逐帧审核'],
  ['正式入库', '版本与交付'],
]);

function workbenchStageIndex(snapshot) {
  if (snapshot.completed || snapshot.stepIndex >= 5) return 4;
  if (snapshot.status === 'action_review') return 3;
  if (snapshot.status === 'action_setup' || snapshot.stepIndex >= 2) return 2;
  if (snapshot.status === 'master_review' || snapshot.stepIndex === 1) return 1;
  return 0;
}

function renderWorkbenchFlow(snapshot) {
  const activeIndex = workbenchStageIndex(snapshot);
  return el('ol', { className: 'workbench-flow', attributes: { 'aria-label': '创作阶段' } }, workbenchStages.map(([title, copy], index) => (
    el('li', { className: index < activeIndex ? 'is-done' : index === activeIndex ? 'is-current' : '' }, [
      el('i', { text: index < activeIndex ? '✓' : String(index + 1) }),
      el('span', {}, [el('b', { text: title }), el('small', { text: copy })]),
    ])
  )));
}

function renderWorkbenchAssets(libraryState = {}, snapshot) {
  const characters = libraryState.characters || [];
  const assetUrl = libraryState.assetUrl || ((path) => path);
  const items = characters.length
    ? characters.map((character, index) => {
      const summary = characterSummary(character);
      return el('a', {
        className: index === 0 ? 'workbench-asset is-active' : 'workbench-asset',
        href: hashFor('library', { query: { character: character.id } }),
      }, [
        el('img', { src: assetUrl(character.base), alt: '' }),
        el('span', {}, [el('b', { text: character.label }), el('small', { text: `${summary.entries.length} 组动作 · ${summary.frameCount} 帧` })]),
        el('i', { text: '›' }),
      ]);
    })
    : [el('p', { className: 'workbench-assets__empty', text: libraryState.status === 'loading' ? '正在同步资产…' : '尚无正式资产' })];
  return el('aside', { className: 'workbench-assets' }, [
    el('header', {}, [
      el('span', { className: 'overline', text: 'PROJECT ASSETS' }),
      el('h2', { text: '项目资产' }),
      el('small', { text: '角色 · 造型 · 动作' }),
    ]),
    el('div', { className: 'workbench-assets__tree' }, items),
    el('div', { className: 'workbench-assets__draft' }, [
      el('span', {}, [el('i', { text: '◇' }), el('b', { text: snapshot.profile.name })]),
      el('small', { text: snapshot.completed ? '正式版本 v1' : '当前创作 · 尚未入库' }),
    ]),
  ]);
}

function renderGeneratingStage(snapshot) {
  const actionStage = snapshot.stepIndex >= 2 && snapshot.stepIndex <= 4;
  const deliveryStage = snapshot.stepIndex >= 5;
  const revealedFrames = snapshot.stepIndex === 2 ? 2 : snapshot.stepIndex === 3 ? 6 : 8;
  const title = deliveryStage
    ? '正在保存正式版本'
    : actionStage
      ? '正在生成动作候选'
      : '正在生成角色母版';
  const copy = deliveryStage
    ? '候选帧、检查结果和版本来源正在写入项目资产。'
    : snapshot.activeStep?.copy || '正在处理当前生成阶段。';
  return el('section', { className: `workbench-generation workbench-generation--${actionStage ? 'action' : deliveryStage ? 'delivery' : 'master'}` }, [
    el('div', { className: 'generation-status' }, [
      el('span', { className: 'generation-status__pulse', attributes: { 'aria-hidden': 'true' } }),
      el('div', {}, [el('span', { className: 'overline', text: 'GENERATING' }), el('h2', { text: title }), el('p', { text: copy })]),
      el('strong', { text: `${snapshot.progress}%` }),
    ]),
    actionStage
      ? el('div', { className: 'generation-frame-field' }, DEMO_CHARACTER_ASSETS.frames.map((src, index) => (
        el('span', { className: index < revealedFrames ? 'is-revealed' : '' }, [
          el('img', { src, alt: `候选动作第 ${index + 1} 帧` }),
          el('small', { text: String(index + 1).padStart(2, '0') }),
        ])
      )))
      : el('div', { className: 'generation-master-field' }, [
        el('span', { className: 'generation-grid', attributes: { 'aria-hidden': 'true' } }),
        el('img', { src: DEMO_CHARACTER_ASSETS.base, alt: '正在生成的角色母版' }),
        el('div', { className: 'generation-particles', attributes: { 'aria-hidden': 'true' } }, Array.from({ length: 18 }, () => el('i'))),
      ]),
    el('div', { className: 'generation-progress' }, [el('i')]),
  ]);
}

function renderDefinitionStage(snapshot) {
  if (!snapshot.source) {
    return el('section', { className: 'workbench-definition workbench-definition--source' }, [
      el('span', { className: 'overline', text: 'STARTING POINT' }),
      el('h2', { text: '选择角色的起点' }),
      el('p', { text: '来源只决定第一份身份依据，确认母版后再进入动作生产。' }),
      renderDemoSourceChoices('workbench'),
    ]);
  }
  const profile = snapshot.profile || DEFAULT_DEMO_PROFILE;
  return el('form', { className: 'workbench-definition', id: 'demoCharacterForm' }, [
    el('header', {}, [
      el('div', {}, [el('span', { className: 'overline', text: 'CHARACTER BRIEF' }), el('h2', { text: '定义角色身份' })]),
      renderDemoSourceSummary(snapshot.source),
    ]),
    el('div', { className: 'workbench-definition__fields' }, [
      el('label', {}, [el('span', { text: '角色姓名' }), el('input', { attributes: { name: 'name', maxlength: '40', required: '', value: profile.name } })]),
      el('label', {}, [el('span', { text: '游戏定位' }), el('input', { attributes: { name: 'role', maxlength: '100', required: '', value: profile.role } })]),
      el('label', {}, [el('span', { text: '角色识别点' }), el('textarea', { text: profile.description, attributes: { name: 'description', maxlength: '240', required: '', rows: '4' } })]),
      el('label', {}, [el('span', { text: '视觉约束' }), el('textarea', { text: profile.style, attributes: { name: 'style', maxlength: '180', required: '', rows: '3' } })]),
    ]),
    el('footer', {}, [
      el('span', {}, [el('b', { text: '下一步：生成角色母版' }), el('small', { text: '生成结束后必须由你确认，不会自动继续。' })]),
      el('button', { className: 'button button--primary', type: 'submit', text: '生成角色母版' }),
    ]),
  ]);
}

function renderMasterReview(snapshot) {
  return el('section', { className: 'workbench-review workbench-review--master' }, [
    el('header', {}, [
      el('div', {}, [el('span', { className: 'overline', text: 'MASTER CANDIDATE' }), el('h2', { text: '确认角色母版' }), el('p', { text: '动作生产会继承这张母版的身份、比例、朝向和视觉特征。' })]),
      el('span', { className: 'review-required', text: '需要确认' }),
    ]),
    el('div', { className: 'master-candidate' }, [
      el('div', { className: 'master-candidate__image' }, [
        el('span', { className: 'generation-grid', attributes: { 'aria-hidden': 'true' } }),
        el('img', { src: DEMO_CHARACTER_ASSETS.base, alt: `${snapshot.profile.name} 角色母版候选` }),
        el('small', { text: '256 × 256 · SIDE · ALPHA' }),
      ]),
      el('div', { className: 'master-candidate__facts' }, [
        el('span', { className: 'status-chip', text: '候选 01' }),
        el('h3', { text: snapshot.profile.name }),
        el('p', { text: snapshot.profile.description }),
        el('dl', {}, [
          el('div', {}, [el('dt', { text: '比例' }), el('dd', { text: '一致' })]),
          el('div', {}, [el('dt', { text: '脚底线' }), el('dd', { text: '238 px' })]),
          el('div', {}, [el('dt', { text: '透明背景' }), el('dd', { text: '通过' })]),
        ]),
      ]),
    ]),
    el('footer', {}, [
      el('button', { className: 'button button--ghost', type: 'button', text: '重新生成母版', attributes: { 'data-regenerate-master': '' } }),
      el('button', { className: 'button button--primary', type: 'button', text: '确认母版并配置动作', attributes: { 'data-confirm-master': '' } }),
    ]),
  ]);
}

function renderActionSetup(snapshot) {
  return el('section', { className: 'workbench-action-setup' }, [
    el('header', {}, [
      el('div', {}, [el('span', { className: 'overline', text: 'ACTION SETUP' }), el('h2', { text: '选择本次生成的动作' }), el('p', { text: '母版已经确认。动作只有在确认规格后才会开始生成。' })]),
      el('img', { src: DEMO_CHARACTER_ASSETS.base, alt: '已确认角色母版' }),
    ]),
    el('div', { className: 'action-choice-grid' }, [
      ['呼吸待机', 'idle', '8 帧 · 8 FPS · 循环'],
      ['侧视行走', 'walk', '8 帧 · 8 FPS · 循环'],
    ].map(([label, value, meta]) => el('label', {}, [
      el('input', { type: 'checkbox', attributes: { name: 'actions', value, checked: '' } }),
      el('span', {}, [el('b', { text: label }), el('small', { text: meta })]),
      el('i', { text: '✓' }),
    ]))),
    el('div', { className: 'action-cost' }, [
      el('span', {}, [el('small', { text: '候选输出' }), el('b', { text: '2 组动作 · 16 帧' })]),
      el('span', {}, [el('small', { text: '自动检查' }), el('b', { text: '6 项规则' })]),
      el('span', {}, [el('small', { text: '预计耗时' }), el('b', { text: '约 8 秒' })]),
    ]),
  ]);
}

function renderActionReview(snapshot) {
  return el('section', { className: 'workbench-action-review' }, [
    el('header', {}, [
      el('div', {}, [el('span', { className: 'overline', text: 'ACTION REVIEW' }), el('h2', { text: '检查动作候选' }), el('p', { text: '自动检查已经完成。请确认动作节奏和角色一致性，再决定是否入库。' })]),
      el('span', { className: 'review-required', text: '需要确认' }),
    ]),
    el('div', { className: 'action-review-stage' }, [
      el('div', { className: 'action-loop', attributes: { 'aria-label': '侧视行走循环预览' } }, DEMO_CHARACTER_ASSETS.walkFrames.map((src, index) => (
        el('img', { src, alt: index === 0 ? '侧视行走动作预览' : '' })
      ))),
      el('div', { className: 'action-review-meta' }, [
        el('span', { className: 'status-chip', text: '自动检查 6 / 6' }),
        el('h3', { text: '侧视行走 · 候选批次 01' }),
        el('p', { text: '8 帧循环，脚底基线与主体高度稳定。仍需人工判断动作是否自然。' }),
      ]),
    ]),
  ]);
}

function renderCompletedStage(snapshot) {
  const metadata = JSON.stringify({
    character: snapshot.profile.name,
    actions: ['idle', 'walk'],
    fps: 8,
    frames: 16,
  }, null, 2);
  return el('section', { className: 'workbench-complete' }, [
    el('span', { className: 'workbench-complete__mark', text: '✓' }),
    el('span', { className: 'overline', text: 'FORMAL ASSET V1' }),
    el('h2', { text: '角色与动作已经进入项目资产' }),
    el('p', { text: '母版、待机和行走动作已经作为正式版本保存，候选记录仍可追溯。' }),
    el('div', { className: 'workbench-complete__actions' }, [
      el('a', { className: 'button button--primary', href: hashFor('library', { query: { character: 'boy' } }), text: '查看项目资产' }),
      el('a', { className: 'button button--ghost', href: './review.html?character=boy&view=side&action=walk', text: '打开动作检查台' }),
      el('a', {
        className: 'text-action',
        href: `data:application/json;charset=utf-8,${encodeURIComponent(metadata)}`,
        text: '下载 metadata',
        attributes: { download: `${snapshot.profile.name}-metadata.json` },
      }),
    ]),
  ]);
}

function renderWorkbenchCanvas(snapshot) {
  let content;
  if (snapshot.status === 'running') content = renderGeneratingStage(snapshot);
  else if (snapshot.status === 'master_review') content = renderMasterReview(snapshot);
  else if (snapshot.status === 'action_setup') content = renderActionSetup(snapshot);
  else if (snapshot.status === 'action_review') content = renderActionReview(snapshot);
  else if (snapshot.completed) content = renderCompletedStage(snapshot);
  else content = renderDefinitionStage(snapshot);
  return el('section', { className: 'workbench-canvas' }, [
    el('div', { className: 'workbench-canvas__toolbar' }, [
      el('span', {}, [el('b', { text: snapshot.profile.name }), el('small', { text: workbenchStages[workbenchStageIndex(snapshot)][0] })]),
      el('div', { className: 'production-canvas__zoom', attributes: { 'aria-label': '画布缩放' } }, [
        el('button', { type: 'button', text: '−', attributes: { 'aria-label': '缩小画布', 'data-workbench-zoom-out': '' } }),
        el('output', { text: '100%', attributes: { 'aria-live': 'polite', 'data-workbench-zoom-label': '' } }),
        el('button', { type: 'button', text: '+', attributes: { 'aria-label': '放大画布', 'data-workbench-zoom-in': '' } }),
      ]),
    ]),
    el('div', { className: 'workbench-canvas__viewport' }, [
      el('div', { className: 'workbench-canvas__content', attributes: { 'data-workbench-canvas-content': '' } }, [content]),
    ]),
  ]);
}

function renderWorkbenchInspector(snapshot) {
  const stageIndex = workbenchStageIndex(snapshot);
  const common = [
    ['当前阶段', workbenchStages[stageIndex][0]],
    ['角色', snapshot.profile.name],
    ['视角', 'Side · 朝右'],
  ];
  let body;
  if (snapshot.status === 'action_setup') {
    body = el('form', { className: 'inspector-form', id: 'actionSpecForm' }, [
      el('label', {}, [el('span', { text: '帧率' }), el('select', {}, [el('option', { text: '8 FPS', attributes: { value: '8' } })])]),
      el('label', {}, [el('span', { text: '画布尺寸' }), el('select', {}, [el('option', { text: '256 × 256', attributes: { value: '256' } })])]),
      el('label', {}, [el('span', { text: '循环方式' }), el('select', {}, [el('option', { text: '循环', attributes: { value: 'loop' } })])]),
      el('label', {}, [el('span', { text: '动作约束' }), el('textarea', { text: '保持角色比例与侧视朝向，脚底始终对齐基线。', attributes: { rows: '4' } })]),
      el('button', { className: 'button button--primary', type: 'submit', text: '确认规格并生成动作' }),
    ]);
  } else if (snapshot.status === 'action_review') {
    body = el('div', { className: 'inspector-review' }, [
      ...['透明背景', '画布尺寸', '脚底基线', '主体高度', '相邻位移', '循环接缝'].map((label) => el('span', {}, [el('i', { text: '✓' }), el('b', { text: label }), el('small', { text: '通过' })])),
      el('textarea', { attributes: { rows: '3', placeholder: '退回时填写修改意见…' } }),
      el('div', {}, [
        el('button', { className: 'button button--ghost', type: 'button', text: '重新生成动作', attributes: { 'data-regenerate-actions': '' } }),
        el('button', { className: 'button button--primary', type: 'button', text: '确认动作并正式入库', attributes: { 'data-approve-actions': '' } }),
      ]),
    ]);
  } else {
    body = el('dl', { className: 'inspector-facts' }, common.map(([label, value]) => (
      el('div', {}, [el('dt', { text: label }), el('dd', { text: value })])
    )));
  }
  return el('aside', { className: 'workbench-inspector' }, [
    el('header', {}, [el('span', { className: 'overline', text: 'INSPECTOR' }), el('h2', { text: '属性与检查' })]),
    body,
    snapshot.status === 'running' ? el('div', { className: 'inspector-process' }, [
      el('span', {}, [el('i', { className: 'generation-status__pulse' }), el('b', { text: '资产生成进程' })]),
      el('p', { text: snapshot.activeStep?.copy || '正在处理当前生成阶段。' }),
      el('small', { text: '当前结果仍是候选，不会自动写入正式资产。' }),
    ]) : null,
  ]);
}

function renderWorkbenchDock(snapshot) {
  const frameReady = snapshot.stepIndex >= 2 || ['action_review', 'completed'].includes(snapshot.status);
  return el('section', { className: 'workbench-dock' }, [
    el('header', {}, [
      el('nav', {}, [el('button', { className: 'is-active', type: 'button', text: '候选帧' }), el('button', { type: 'button', text: '生成记录' })]),
      el('span', { text: frameReady ? 'side / walk · 8 帧 · 8 FPS' : '等待动作生成' }),
    ]),
    el('div', { className: 'workbench-filmstrip' }, DEMO_CHARACTER_ASSETS.walkFrames.map((src, index) => (
      el('span', { className: frameReady ? 'is-ready' : '' }, [
        frameReady ? el('img', { src, alt: '' }) : el('i', { text: '·' }),
        el('small', { text: String(index + 1).padStart(2, '0') }),
      ])
    ))),
    el('div', { className: 'workbench-job' }, [
      el('i', { className: snapshot.status === 'running' ? 'is-running' : '' }),
      el('span', {}, [el('b', { text: snapshot.status === 'running' ? snapshot.activeStep.title : snapshot.completed ? '正式版本已保存' : '等待下一步操作' }), el('small', { text: snapshot.status === 'running' ? '生成过程可见，完成后等待人工确认' : '所有自动结果先进入候选区' })]),
      el('strong', { text: `${snapshot.progress}%` }),
    ]),
  ]);
}

const masterCandidates = Object.freeze([
  { id: 'boy', label: '少年', src: DEMO_CHARACTER_ASSETS.base },
  { id: 'skeleton', label: '骷髅剑士', src: '../assets/resources/characters/skeleton/base.png' },
  { id: 'lirael', label: '暗色游侠', src: '../assets/resources/characters/lirael/base.png' },
  { id: 'samurai', label: '武士', src: '../assets/resources/characters/samurai/base.png' },
  { id: 'knight', label: '骑士', src: '../assets/resources/characters/knight/base.png' },
  { id: 'lamplighter', label: '守夜人', src: '../assets/resources/character/frames/walk-01.png' },
]);

const projectLabels = Object.freeze({
  side: '横版侧视',
  topdown: '俯视',
  isometric: '2.5D',
  1: '单向',
  4: '四向',
  8: '八向',
});

function renderNaturalScreenHeader(title, options = {}) {
  return el('header', { className: 'natural-agent-header' }, [
    el('button', {
      className: 'natural-agent-back',
      type: 'button',
      attributes: { 'data-studio-mode-back': '', 'aria-label': '返回创作方式选择' },
    }, [
      el('span', { text: '返回' }),
      el('b', { text: title }),
    ]),
    el('div', { className: 'natural-agent-switch', attributes: { role: 'group', 'aria-label': '创作模式' } }, [
      el('button', {
        className: 'is-active',
        type: 'button',
        text: 'AI 快捷创作',
        attributes: { disabled: '', 'aria-pressed': 'true' },
      }),
      el('button', {
        type: 'button',
        text: '节点工作流',
        attributes: { 'data-studio-mode': 'workflow', 'aria-pressed': 'false' },
      }),
    ]),
    options.trailing || el('span', { className: 'natural-agent-header__spacer', attributes: { 'aria-hidden': 'true' } }),
  ]);
}

function renderStudioModeChooser() {
  return el('section', { className: 'studio-mode-gateway', attributes: { 'data-studio-mode-gateway': '' } }, [
    el('header', { className: 'studio-mode-gateway__header' }, [
      el('a', { className: 'studio-mode-gateway__back', href: hashFor('home'), text: '返回首页', attributes: { 'aria-label': '返回产品首页' } }),
      el('span', { className: 'overline', text: 'CREATE / TWO WAYS' }),
      el('h1', { id: 'workflowPageTitle', text: '选择你的创作方式' }),
      el('p', { text: '沿用可逐步确认的节点工作流，或用一句自然语言直接完成角色资产的创建与交付准备。' }),
    ]),
    el('div', { className: 'studio-mode-gateway__choices' }, [
      el('button', {
        className: 'studio-mode-card studio-mode-card--workflow',
        type: 'button',
        attributes: { 'data-studio-mode': 'workflow', 'data-pointer-card': '' },
      }, [
        el('span', { className: 'studio-mode-card__eyebrow', text: 'STEP BY STEP' }),
        el('span', { className: 'studio-mode-card__index', text: '01' }),
        el('span', { className: 'studio-mode-card__copy' }, [
          el('small', { text: 'GUIDED WORKFLOW' }),
          el('b', { text: '从一个项目开始' }),
          el('p', { text: '保留从零开始、上传参考图和复用资产库三种来源，逐节点连接、生成与确认。' }),
        ]),
        el('span', { className: 'studio-mode-card__action', text: '进入工作流  ↗' }),
      ]),
      el('button', {
        className: 'studio-mode-card studio-mode-card--natural',
        type: 'button',
        attributes: { 'data-studio-mode': 'natural', 'data-pointer-card': '' },
      }, [
        el('span', { className: 'studio-mode-card__eyebrow', text: 'ONE COMMAND' }),
        el('span', { className: 'studio-mode-card__index', text: '02' }),
        el('span', { className: 'studio-mode-card__copy' }, [
          el('small', { text: 'NATURAL LANGUAGE' }),
          el('b', { text: '快速开始' }),
          el('p', { text: '描述角色、动作和交付目标，自动完成理解、生成、质检与打包。' }),
        ]),
        el('span', { className: 'studio-mode-card__action', text: '输入创作指令  →' }),
      ]),
    ]),
    el('footer', { className: 'studio-mode-gateway__note' }, [
      el('i', { attributes: { 'aria-hidden': 'true' } }),
      el('span', {}, [
        el('b', { text: '智能生成' }),
        el('small', { text: '从创作指令到可导出资产，由系统连续完成。' }),
      ]),
    ]),
  ]);
}

const naturalExamples = Object.freeze([
  '创建一个名叫守夜人的低饱和像素角色，采用横版侧视，生成待机和行走动作并导出 Sprite Sheet 与 JSON。',
  '做一名叫轻装信使的少年角色，侧视单向，动作轻快，完成后准备导出。',
  '生成一个暗色游侠角色，保持清晰轮廓，制作 Idle 与 Walk 八帧循环动画。',
]);

const NATURAL_CHARACTER_OPTIONS = Object.freeze([
  { id: 'lamplighter', label: '守夜人', prompt: naturalExamples[0] },
  { id: 'boy', label: '少年', prompt: '创建一个像素少年角色，横版侧视，生成待机和行走动作并导出 Sprite Sheet 与 JSON。' },
  { id: 'skeleton', label: '骷髅剑士', prompt: '生成一个卡通像素骷髅剑士角色，横版侧视，制作行走八帧循环动画并导出 Sprite Sheet。' },
  { id: 'lirael', label: '暗色游侠', prompt: '创建一名叫暗色游侠的像素德鲁伊角色，横版侧视，生成待机动作并导出。' },
  { id: 'samurai', label: '武士', prompt: '生成一个像素武士角色，横版侧视，制作待机、行走和跳跃动作并导出 Sprite Sheet 与 JSON。' },
  { id: 'knight', label: '骑士', prompt: '创建一名灰度像素骑士角色，横版侧视，生成待机动作并导出 Sprite Sheet。' },
]);

function renderCharacterSelector() {
  return el('div', { className: 'natural-agent-character-picker', attributes: { 'aria-label': '选择角色资产' } },
    NATURAL_CHARACTER_OPTIONS.map((option) => {
      const record = characterCatalog[option.id];
      return el('button', {
        type: 'button',
        className: '',
        attributes: { 'data-natural-character': option.id, 'aria-label': `使用${option.label}资产` },
      }, [
        el('img', { src: record?.base || characterCatalog.boy.base, alt: option.label }),
        el('span', { text: option.label }),
      ]);
    }),
  );
}

function resolveNaturalAssets(intent) {
  const id = intent?.characterId || 'boy';
  const record = characterCatalog[id] || characterCatalog.boy;
  const fallback = { base: DEMO_CHARACTER_ASSETS.base, idleFrames: DEMO_CHARACTER_ASSETS.idleFrames, walkFrames: DEMO_CHARACTER_ASSETS.walkFrames };
  if (!record) return { ...fallback, fallbackIdleFrames: fallback.idleFrames, fallbackWalkFrames: fallback.walkFrames };
  const side = record.library?.side;

  let idleFrames = side?.idle?.frames;
  let walkFrames = side?.walk?.frames;

  // Cross-action fallback: if one action is missing, use the other
  if (!idleFrames && walkFrames) idleFrames = walkFrames;
  if (!walkFrames && idleFrames) walkFrames = idleFrames;

  // Trim to 8 frames for display, or pad if fewer than 8
  const DISPLAY = 8;
  const normalize = (frames) => {
    if (!frames || !frames.length) return null;
    if (frames.length >= DISPLAY) return frames.slice(0, DISPLAY);
    const padded = [...frames];
    while (padded.length < DISPLAY) padded.push(frames[padded.length % frames.length]);
    return padded;
  };

  idleFrames = normalize(idleFrames) || fallback.idleFrames;
  walkFrames = normalize(walkFrames) || fallback.walkFrames;

  return {
    base: record.base || fallback.base,
    idleFrames,
    walkFrames,
    fallbackIdleFrames: fallback.idleFrames,
    fallbackWalkFrames: fallback.walkFrames,
  };
}

function renderNaturalCommandInput(snapshot, settled) {
  return el('section', { className: 'natural-creation natural-agent-screen natural-agent-screen--input', attributes: settled ? { 'data-agent-settled': '' } : {} }, [
    renderNaturalScreenHeader('AI 资产生成'),
    el('button', {
      className: 'natural-agent-suggestion',
      type: 'button',
      attributes: { 'data-natural-example': naturalExamples[0], 'aria-label': '使用推荐创作指令' },
    }, [
      el('span', { text: '你可能想做：' }),
      el('b', { text: '一位提着风灯、披深色斗篷的像素守夜人' }),
    ]),
    el('form', { className: 'natural-agent-composer', id: 'naturalCreationForm' }, [
      el('label', { className: 'natural-agent-composer__field' }, [
        el('span', { text: '创作指令' }),
        el('textarea', {
          text: snapshot.intent?.command || '',
          attributes: {
            name: 'command',
            required: '',
            minlength: '4',
            maxlength: '600',
            rows: '2',
            placeholder: '描述你想生成的角色、动作与导出格式…',
          },
        }),
      ]),
      el('div', { className: 'natural-agent-composer__meta' }, [
        el('span', { text: '像素角色' }),
        el('small', { text: `预计约 ${Math.round(NATURAL_CREATION_DURATION_MS / 1000)} 秒 · 8 FPS` }),
      ]),
      el('button', { className: 'natural-agent-composer__submit', type: 'submit', text: '开始生成' }),
      snapshot.error ? el('p', { className: 'natural-command-form__error', text: snapshot.error }) : null,
    ]),
    renderCharacterSelector(),
    el('div', { className: 'natural-agent-examples', attributes: { 'aria-label': '示例指令' } }, naturalExamples.slice(1).map((example, index) => el('button', {
      type: 'button',
      text: index === 0 ? '少年' : '暗色游侠',
      attributes: { 'data-natural-example': example },
    }))),
    el('aside', { className: 'natural-agent-preview', attributes: { 'data-pointer-card': 'subtle' } }, [
      el('span', {}, [el('b', { text: 'OUTPUT PREVIEW' }), el('small', { text: 'IDENTITY / IDLE / WALK' })]),
      el('img', { src: DEMO_CHARACTER_ASSETS.base, alt: '角色输出预览' }),
    ]),
  ]);
}

function renderNaturalProgress(snapshot, settled) {
  const assets = resolveNaturalAssets(snapshot.intent);
  const active = snapshot.steps[snapshot.stepIndex] || snapshot.steps[0];
  const arrivedIds = new Set(snapshot.artifacts.map((artifact) => artifact.id));
  const masterArrived = arrivedIds.has('master');
  const latestCheck = snapshot.qualityChecks.at(-1);
  const activeArtifact = latestCheck
    ? `质检 · ${latestCheck.label}`
    : snapshot.activeArtifact?.label || '等待首个图像产物';
  const renderLiveRail = (action, frames, fallbackFrames) => el('section', { className: 'natural-live-rail' }, [
    el('header', {}, [
      el('span', {}, [el('small', { text: `SIDE / ${action.toUpperCase()}` }), el('b', { text: '逐帧产物' })]),
      el('strong', { text: `${snapshot.artifacts.filter((artifact) => artifact.action === action).length} / 8` }),
    ]),
    el('div', { className: 'natural-live-rail__frames', attributes: { 'aria-label': `${action} 中间产物` } }, frames.map((src, index) => {
      const id = `${action}-${String(index + 1).padStart(2, '0')}`;
      const arrived = arrivedIds.has(id);
      const img = arrived && fallbackFrames
        ? (() => { const node = el('img', { src, alt: `${action} 第 ${index + 1} 帧已生成` }); node.onerror = function () { this.onerror = null; this.src = fallbackFrames[index] || fallbackFrames[0]; }; return node; })()
        : arrived ? el('img', { src, alt: `${action} 第 ${index + 1} 帧已生成` }) : null;
      return el('span', { className: arrived ? 'is-arrived' : 'is-pending' }, [
        img || (arrived ? null : el('i', { attributes: { 'aria-hidden': 'true' } })),
        el('small', { text: String(index + 1).padStart(2, '0') }),
      ]);
    })),
  ]);
  return el('section', { className: 'natural-creation natural-agent-screen natural-agent-screen--progress', attributes: { 'data-natural-status': snapshot.status, ...(settled ? { 'data-agent-settled': '' } : {}) } }, [
    renderNaturalScreenHeader('AI 资产生成', {
      trailing: el('div', { className: 'natural-agent-live', attributes: { 'aria-label': `已收到 ${snapshot.artifacts.length} 个图像产物` } }, [
        el('i', { attributes: { 'aria-hidden': 'true' } }),
        el('span', {}, [el('small', { text: 'LIVE 生成记录' }), el('b', { text: `${snapshot.artifacts.length} / 17` })]),
      ]),
    }),
    el('div', { className: 'natural-agent-stage' }, [
      el('section', { className: 'natural-progress__visual natural-live-board' }, [
        el('header', { className: 'natural-live-board__header' }, [
          el('span', {}, [el('small', { text: 'CURRENT OUTPUT' }), el('b', { text: activeArtifact })]),
          el('strong', { text: snapshot.qualityChecks.length ? `质检 ${snapshot.qualityChecks.length} / 5` : '产物实时到达' }),
        ]),
        el('div', { className: `natural-live-master ${masterArrived ? 'is-arrived' : 'is-pending'}` }, [
          el('div', { className: 'natural-progress__resolve', attributes: { 'aria-hidden': 'true' } }, Array.from({ length: 36 }, (_, index) => el('i', { className: `resolve-ring-${Math.floor(index / 8)}` }))),
          masterArrived ? (() => { const img = el('img', { src: assets.base, alt: `${snapshot.intent.name} 身份母版已生成` }); img.onerror = function () { this.onerror = null; this.src = DEMO_CHARACTER_ASSETS.base; }; return img; })() : null,
          el('span', {}, [el('small', { text: 'IDENTITY MASTER' }), el('b', { text: masterArrived ? snapshot.intent.name : '等待母版产物' })]),
        ]),
        el('div', { className: 'natural-live-sequences' }, [
          renderLiveRail('idle', assets.idleFrames, assets.fallbackIdleFrames),
          renderLiveRail('walk', assets.walkFrames, assets.fallbackWalkFrames),
        ]),
      ]),
      el('aside', { className: 'natural-agent-runner' }, [
        el('header', {}, [
          el('span', {}, [el('small', { text: `AI ASSET PIPELINE / LIVE / ${snapshot.artifacts.length} OUTPUTS` }), el('b', { text: active.label })]),
          el('strong', { text: `${snapshot.progress}%` }),
        ]),
        el('p', { text: active.copy }),
        el('div', { className: 'natural-progress__bar' }, [
          el('progress', { attributes: { max: '100', value: String(snapshot.progress), 'aria-label': `一键创作进度 ${snapshot.progress}%` } }),
        ]),
        el('ol', { className: 'natural-progress__steps' }, snapshot.steps.map((step, index) => el('li', {
          className: `is-${step.status}`,
        }, [
          el('i', { text: step.status === 'completed' ? '✓' : String(index + 1).padStart(2, '0') }),
          el('span', {}, [el('b', { text: step.label }), el('small', { text: step.copy })]),
          el('em', { text: step.status === 'running' ? '处理中' : step.status === 'completed' ? '完成' : '等待', attributes: { 'aria-label': step.status } }),
        ]))),
        el('div', { className: 'natural-progress__intent' }, [
          el('span', { text: '已理解' }),
          el('dl', {}, [
            ['视角', projectLabels[snapshot.intent.view]],
            ['动作', snapshot.intent.actions.map((action) => action.toUpperCase()).join(' + ')],
            ['导出', snapshot.intent.exportFormats.join(' / ')],
          ].map(([term, value]) => el('div', {}, [el('dt', { text: term }), el('dd', { text: value })]))),
        ]),
      ]),
    ]),
  ]);
}

function renderNaturalResult(snapshot, settled) {
  const assets = resolveNaturalAssets(snapshot.intent);
  const previewHref = `./review.html?character=${snapshot.intent.characterId || 'boy'}&view=side&action=walk`;
  return el('section', { className: 'natural-creation natural-agent-screen natural-agent-screen--result', attributes: settled ? { 'data-agent-settled': '' } : {} }, [
    renderNaturalScreenHeader('AI 资产生成'),
    el('div', { className: 'natural-agent-result-stage' }, [
      el('section', { className: 'natural-result__assets' }, [
        el('figure', { className: 'natural-result__master' }, [
          (() => { const img = el('img', { src: assets.base, alt: `${snapshot.intent.name}身份母版` }); img.onerror = function () { this.onerror = null; this.src = DEMO_CHARACTER_ASSETS.base; }; return img; })(),
          el('figcaption', {}, [el('small', { text: 'IDENTITY MASTER' }), el('b', { text: snapshot.intent.name })]),
        ]),
        el('div', { className: 'natural-result__sequences' }, [
          el('header', {}, [el('span', {}, [el('small', { text: 'SIDE / WALK' }), el('b', { text: '8 FPS · LOOP' })]), el('i', { text: '8 FRAMES' })]),
          renderFrameStrip(assets.walkFrames, null, 'Walk 八帧动作序列', assets.fallbackWalkFrames),
          el('header', {}, [el('span', {}, [el('small', { text: 'SIDE / IDLE' }), el('b', { text: '8 FPS · LOOP' })]), el('i', { text: '8 FRAMES' })]),
          renderFrameStrip(assets.idleFrames, null, 'Idle 八帧动作序列', assets.fallbackIdleFrames),
        ]),
      ]),
      el('aside', { className: 'natural-agent-delivery' }, [
        el('header', {}, [
          el('span', {}, [el('small', { text: 'ASSET READY' }), el('h1', { id: 'workflowPageTitle', text: `${snapshot.intent.name}已准备完成` })]),
          el('span', { className: 'natural-agent-delivery__badge', text: '完成', attributes: { 'aria-label': '生成完成' } }),
        ]),
        el('p', { text: '身份母版、Idle 与 Walk 已通过完整质量检查，可继续导出或发送到预览台。' }),
        el('div', { className: 'natural-result__checks' }, ['透明背景', '画布尺寸', '脚底基线', '主体高度', '相邻位移', '循环接缝'].map((label) => el('span', {}, [
          el('i', { text: '通过' }),
          el('b', { text: label }),
        ]))),
        el('div', { className: 'publish-options natural-result__options' }, [
          el('button', { type: 'button', attributes: { 'data-export-pack': '' } }, [
            el('b', { text: '导出资产' }),
            el('small', { text: '下载 SpriteSheet 与 JSON' }),
          ]),
          el('a', { href: previewHref }, [
            el('b', { text: '发送到预览台' }),
            el('small', { text: '检查动作播放与循环效果' }),
          ]),
        ]),
        snapshot.savedName ? el('div', { className: 'natural-result__saved' }, [
          el('i', { text: '✓' }),
          el('span', {}, [el('b', { text: '快捷方案已保存到当前会话' }), el('small', { text: snapshot.savedName })]),
        ]) : el('form', { className: 'workflow-save-form', attributes: { 'data-natural-save-form': '' } }, [
          el('label', {}, [
            el('span', { text: '保存为快捷方案' }),
            el('input', { attributes: { name: 'workflowName', required: '', maxlength: '48', value: `${snapshot.intent.name} 一键方案` } }),
          ]),
          el('button', { type: 'submit', text: '保存方案' }),
          el('small', { text: '方案将保存在当前创作会话中。' }),
        ]),
        el('footer', {}, [
          el('button', { className: 'button button--primary', type: 'button', text: '再次创建', attributes: { 'data-natural-reset': '' } }),
        ]),
      ]),
    ]),
  ]);
}

function renderNaturalCreation(snapshot, settled) {
  if (snapshot.status === 'running') return renderNaturalProgress(snapshot, settled);
  if (snapshot.status === 'completed') return renderNaturalResult(snapshot, settled);
  return renderNaturalCommandInput(snapshot, settled);
}

function renderProjectSetup(projectContext = {}, workflowState = {}) {
  const templates = workflowState.items || [];
  const selectedTemplate = templates.find((item) => item.id === workflowState.selectedId);
  const defaults = selectedTemplate?.project || projectContext;
  const iconPixels = Array.from({ length: 289 }, (_, index) => {
    const x = index % 17;
    const y = Math.floor(index / 17);
    const frame = ((y === 3 || y === 13) && x >= 3 && x <= 13) || ((x === 3 || x === 13) && y >= 3 && y <= 13);
    const handle = (x === 2 || x === 14) && (y === 2 || y === 14);
    const cursor = [[8, 7], [8, 8], [8, 9], [8, 10], [8, 11], [9, 8], [9, 9], [9, 10], [10, 9], [10, 10], [11, 10], [10, 11], [11, 12]].some(([px, py]) => px === x && py === y);
    const guide = (y === 6 && x >= 5 && x <= 7) || (x === 6 && y >= 5 && y <= 7);
    const ring = Math.min(8, Math.floor(Math.hypot(x - 8, y - 8)));
    const phase = (x + y) % 4;
    const role = handle ? 'is-active is-handle' : cursor ? 'is-active is-cursor' : frame || guide ? 'is-active' : '';
    const className = `pixel-ring-${ring} pixel-phase-${phase} ${role}`.trim();
    return el('i', { className });
  });
  return el('section', { className: 'project-setup' }, [
    el('div', { className: 'project-setup__intro' }, [
      el('div', { className: 'project-setup__pixel-icon', attributes: { 'aria-label': '画布工作台' } }, iconPixels),
    ]),
    el('form', { className: 'project-setup__form', id: 'projectContextForm' }, [
      el('header', { className: 'project-setup__form-head project-setup__wide' }, [
        el('div', {}, [
          el('h2', { id: 'workflowPageTitle', text: '新建角色项目' }),
        ]),
      ]),
      el('label', { className: 'project-setup__wide' }, [
        el('span', { text: '启动方式' }),
        el('select', { attributes: { 'data-workflow-template-select': '', name: 'workflowTemplate' } }, [
          el('option', { text: '空白流程', attributes: { value: '', ...(!workflowState.selectedId ? { selected: '' } : {}) } }),
          ...templates.map((template) => el('option', { text: template.name, attributes: { value: template.id, ...(template.id === workflowState.selectedId ? { selected: '' } : {}) } })),
        ]),
      ]),
      el('label', { className: 'project-setup__wide' }, [
        el('span', { text: '项目名称' }),
        el('input', { attributes: { name: 'projectName', required: '', maxlength: '48', value: projectContext.projectName || '', placeholder: '例如：雾港来信' } }),
      ]),
      el('label', {}, [
        el('span', { text: '游戏视角' }),
        el('select', { attributes: { name: 'view' } }, [
          el('option', { text: '横版侧视', attributes: { value: 'side', ...(defaults.view === 'side' ? { selected: '' } : {}) } }),
          el('option', { text: '俯视', attributes: { value: 'topdown', ...(defaults.view === 'topdown' ? { selected: '' } : {}) } }),
          el('option', { text: '2.5D', attributes: { value: 'isometric', ...(defaults.view === 'isometric' ? { selected: '' } : {}) } }),
        ]),
      ]),
      el('label', {}, [
        el('span', { text: '方向数量' }),
        el('select', { attributes: { name: 'directions' } }, [
          el('option', { text: '单向', attributes: { value: '1', ...(defaults.directions === '1' ? { selected: '' } : {}) } }),
          el('option', { text: '四向', attributes: { value: '4', ...(defaults.directions === '4' ? { selected: '' } : {}) } }),
          el('option', { text: '八向', attributes: { value: '8', ...(defaults.directions === '8' ? { selected: '' } : {}) } }),
        ]),
      ]),
      el('label', {}, [
        el('span', { text: '角色画布尺寸' }),
        el('select', { attributes: { name: 'canvasSize' } }, [
          el('option', { text: '256 × 256', attributes: { value: '256', ...(defaults.canvasSize === '256' ? { selected: '' } : {}) } }),
          el('option', { text: '128 × 128', attributes: { value: '128', ...(defaults.canvasSize === '128' ? { selected: '' } : {}) } }),
          el('option', { text: '512 × 512', attributes: { value: '512', ...(defaults.canvasSize === '512' ? { selected: '' } : {}) } }),
        ]),
      ]),
      el('label', { className: 'project-setup__wide' }, [
        el('span', { text: '美术风格或参考图' }),
        el('textarea', { text: defaults.style || '', attributes: { name: 'style', rows: '3', maxlength: '240', placeholder: '例如：低饱和像素风、细长比例、深灰旅行服' } }),
        el('span', { className: 'project-reference' }, [
          el('input', { type: 'file', attributes: { name: 'reference', accept: 'image/png,image/jpeg,image/webp' } }),
          el('small', { text: '可选 · PNG / JPG / WebP' }),
        ]),
      ]),
      el('footer', { className: 'project-setup__wide' }, [
        el('span', {}, [
          el('i', { attributes: { 'aria-hidden': 'true' } }),
          el('small', { text: selectedTemplate ? `复用「${selectedTemplate.name}」并自动运行` : '空白流程 · 每个节点由你连接并确认' }),
        ]),
        el('button', { className: 'button button--primary', type: 'submit' }, [
          el('span', { text: selectedTemplate ? '使用流程进入画布' : '进入空白创作画布' }),
          el('i', { text: '↗', attributes: { 'aria-hidden': 'true' } }),
        ]),
      ]),
    ]),
  ]);
}

function nodePort(kind, enabled = true) {
  return el('button', {
    className: `graph-port graph-port--${kind}`,
    type: 'button',
    attributes: {
      'aria-label': kind === 'input' ? '输入端口' : '输出端口',
      'data-enabled': String(enabled),
      'data-port': kind,
    },
  });
}

function graphNode({ id, eyebrow, title, x, y, body, input = true, output = true, outputEnabled = true, className = '', focus = false, focusGroup = false }) {
  return el('article', {
    className: `graph-node ${className}`.trim(),
    attributes: { 'data-node-id': id, 'data-node-focus': String(focus), 'data-node-focus-group': String(focusGroup), 'data-x': String(x), 'data-y': String(y) },
  }, [
    input ? nodePort('input') : null,
    el('header', { attributes: { 'data-node-drag': '' } }, [
      el('span', {}, [el('small', { text: eyebrow }), el('h2', { text: title })]),
      el('i', { attributes: { 'aria-hidden': 'true' } }, [el('b'), el('b'), el('b')]),
    ]),
    el('div', { className: 'graph-node__body' }, body),
    input ? el('button', {
      className: 'graph-node__connect-surface', type: 'button',
      attributes: { 'aria-label': `确认连接到${title}`, 'data-node-connect-surface': '' },
    }, [el('span', { text: '点击卡片确认连接' })]) : null,
    output ? nodePort('output', outputEnabled) : null,
  ]);
}

function nodeStatus(label, state) {
  const text = {
    locked: '等待上游', ready: '可以生成', generating: '生成中', review: '等待确认', confirmed: '已确认', idle: '尚未生成',
  }[state] || state;
  return el('div', { className: `node-status node-status--${state}` }, [el('span', { text: label }), el('b', { text })]);
}

function jobIsRunning(snapshot, kind, action = null) {
  return (snapshot.jobs || []).some((job) => job.kind === kind && job.action === action);
}

function activeJob(snapshot, kind, action = null) {
  return (snapshot.jobs || []).find((job) => job.kind === kind && job.action === action) || null;
}

function generationVisual(src, label, kind = 'image', arrived = true) {
  return el('div', { className: `node-generation node-generation--${kind}` }, [
    el('div', { className: 'node-generation__dots', attributes: { 'aria-hidden': 'true' } }, Array.from({ length: 81 }, (_, index) => {
      const x = index % 9 - 4;
      const y = Math.floor(index / 9) - 4;
      const ring = Math.max(Math.abs(x), Math.abs(y));
      return el('i', { className: `dot-ring-${ring}` });
    })),
    src && arrived ? el('img', { src, alt: label }) : null,
    el('small', { text: label }),
  ]);
}

function selectedAssetSet(snapshot) {
  const id = snapshot.masterCandidate || 'boy';
  const root = `../assets/resources/characters/${id}`;
  const master = masterCandidates.find((candidate) => candidate.id === id)?.src || DEMO_CHARACTER_ASSETS.base;
  if (id === 'boy') return { master, idle: DEMO_CHARACTER_ASSETS.idleFrames, walk: DEMO_CHARACTER_ASSETS.walkFrames };
  const walk = Array.from({ length: 8 }, (_, index) => `${root}/views/side/walk-${String(index + 1).padStart(2, '0')}.png`);
  return { master, idle: Array(8).fill(master), walk };
}

function renderFrameStrip(frames, received, label, fallbackFrames) {
  const isLive = Number.isInteger(received);
  return el('div', { className: `node-frame-strip ${isLive ? 'is-revealing' : ''}`, attributes: { 'aria-label': label } }, frames.map((src, index) => {
    const arrived = !isLive || index < received;
    const img = arrived && fallbackFrames
      ? (() => { const node = el('img', { src, alt: index === 0 ? label : '' }); node.onerror = function () { this.onerror = null; this.src = fallbackFrames[index] || fallbackFrames[0]; }; return node; })()
      : arrived ? el('img', { src, alt: index === 0 ? label : '' }) : null;
    return el('span', { className: arrived ? 'is-arrived' : 'is-pending' }, [
      img || (arrived ? null : el('i', { attributes: { 'aria-hidden': 'true' } })),
      el('small', { text: String(index + 1).padStart(2, '0') }),
    ]);
  }));
}

function renderSourceNode(snapshot, focus) {
  return graphNode({
    id: 'source', eyebrow: '01 · SOURCE', title: '选择角色起点', x: 70, y: 280, input: false, focus,
    outputEnabled: Boolean(snapshot.source),
    body: [
      el('p', { text: '选择一种母版输入方式。确认后再连接到母版生成节点。' }),
      el('div', { className: 'node-source-list' }, DEMO_SOURCE_OPTIONS.map((source) => el('button', {
        className: snapshot.sourceId === source.id ? 'is-selected' : '', type: 'button',
        attributes: { 'data-demo-source': source.id },
      }, [el('span', { text: source.label }), el('small', { text: source.eyebrow })]))),
    ],
  });
}

function renderMasterGenerator(snapshot, focus, projectContext, libraryState = {}) {
  const running = jobIsRunning(snapshot, 'master');
  const job = activeJob(snapshot, 'master');
  const sourceField = snapshot.sourceId === 'upload'
    ? el('label', {}, [el('span', { text: '角色参考图' }), el('input', { type: 'file', attributes: { name: 'reference', accept: 'image/png,image/jpeg,image/webp', required: '' } })])
    : snapshot.sourceId === 'existing'
      ? el('label', {}, [el('span', { text: '已有角色' }), el('select', { attributes: { name: 'existingCharacter', required: '' } }, [
        el('option', { text: '请选择项目资产', attributes: { value: '' } }),
        ...(libraryState.characters || []).map((character) => el('option', { text: character.label, attributes: { value: character.id } })),
      ])])
      : null;
  return graphNode({
    id: 'master-gen', eyebrow: '02 · GENERATE', title: '生成参考母版', x: 510, y: 180, focus,
    outputEnabled: ['review', 'confirmed'].includes(snapshot.master), className: running ? 'is-running' : '',
    body: [
      nodeStatus('母版任务', snapshot.master),
      running ? el('div', { className: 'master-arrival-grid', attributes: { 'aria-label': '母版候选实时到达' } }, masterCandidates.map((candidate, index) => {
        const arrived = index < (job?.arrivals || 0);
        return el('span', { className: arrived ? 'is-arrived' : 'is-pending' }, [
          arrived ? el('img', { src: candidate.src, alt: `${candidate.label}候选已生成` }) : el('i', { attributes: { 'aria-hidden': 'true' } }),
          el('small', { text: arrived ? `候选 0${index + 1}` : '生成中' }),
        ]);
      })) : el('form', { className: 'node-brief-form', id: 'masterBriefForm' }, [
        el('label', {}, [el('span', { text: '角色名称' }), el('input', { attributes: { name: 'name', required: '', maxlength: '40', value: snapshot.master === 'review' ? snapshot.profile.name : '', placeholder: '输入角色名称' } })]),
        el('label', {}, [el('span', { text: '身份与外观' }), el('textarea', { text: snapshot.master === 'review' ? snapshot.profile.description : '', attributes: { name: 'description', required: '', maxlength: '240', rows: '3', placeholder: '描述身份、服装、体型和识别特征' } })]),
        el('label', {}, [el('span', { text: '美术约束' }), el('textarea', { text: snapshot.master === 'review' ? snapshot.profile.style : projectContext.style || '', attributes: { name: 'style', required: '', maxlength: '180', rows: '2', placeholder: '输入风格、色彩和材质约束' } })]),
        sourceField,
        el('button', { className: 'node-action', type: 'submit', text: snapshot.master === 'review' ? '重新生成候选' : '生成 6 张候选 · 约 15 秒', attributes: { 'data-connection-required': 'source:master-gen' } }),
      ]),
    ],
  });
}

function renderMasterNode(snapshot, focus, focusGroup = false) {
  const assets = selectedAssetSet(snapshot);
  const reviewing = snapshot.master === 'review';
  return graphNode({
    id: 'master', eyebrow: '03 · MOTHER NODE', title: '确认母节点', x: 950, y: 240, focus, focusGroup,
    outputEnabled: snapshot.master === 'confirmed',
    body: [
      nodeStatus('人工决策', snapshot.master),
      reviewing ? el('div', { className: 'master-choice-grid' }, masterCandidates.map((candidate, index) => el('button', {
        className: snapshot.masterCandidate === candidate.id ? 'is-selected' : '', type: 'button',
        attributes: { 'data-master-candidate': candidate.id },
      }, [el('img', { src: candidate.src, alt: candidate.label }), el('span', { text: `0${index + 1} · ${candidate.label}` })]))) : null,
      snapshot.master === 'confirmed' ? el('figure', { className: 'confirmed-master' }, [el('img', { src: assets.master, alt: '已确认的角色母版' }), el('figcaption', { text: '身份母版已锁定' })]) : null,
      reviewing ? el('button', {
        className: 'node-action', type: 'button', text: '确认所选母版',
        attributes: snapshot.masterCandidate ? { 'data-confirm-master': '' } : { 'data-confirm-master': '', disabled: '' },
      }) : null,
      snapshot.master === 'idle' || snapshot.master === 'generating' ? el('p', { text: '等待候选图进入此节点。' }) : null,
    ],
  });
}

function renderKeyframeNode(snapshot, action, x, y, focus = false, focusGroup = false) {
  const branch = snapshot.actions[action];
  const label = action === 'walk' ? 'Walk 第一帧' : 'Idle 第一帧';
  const frames = selectedAssetSet(snapshot)[action];
  const running = jobIsRunning(snapshot, 'keyframe', action);
  const job = activeJob(snapshot, 'keyframe', action);
  return graphNode({
    id: `${action}-key`, eyebrow: `04 · ${action.toUpperCase()}`, title: label, x, y, focus, focusGroup,
    outputEnabled: branch.keyframe === 'confirmed', className: running ? 'is-running' : '',
    body: [
      nodeStatus('关键帧', branch.keyframe),
      running ? generationVisual(frames[0], job?.arrivals ? `${label}已到达` : `${label}正在生成`, 'image', Boolean(job?.arrivals)) : null,
      ['review', 'confirmed'].includes(branch.keyframe) ? el('figure', { className: 'keyframe-preview' }, [el('img', { src: frames[0], alt: label }), el('figcaption', { text: `${action} · frame 01` })]) : null,
      ['ready', 'review'].includes(branch.keyframe) ? el('form', { className: 'node-brief-form', attributes: { 'data-keyframe-form': action } }, [
        el('label', {}, [el('span', { text: '动作描述' }), el('textarea', { text: branch.brief, attributes: { name: 'brief', required: '', rows: '3', maxlength: '180', placeholder: action === 'walk' ? '描述步态、重心、速度和情绪' : '描述呼吸、重心和待机细节' } })]),
        el('button', { className: 'node-action', type: 'submit', text: branch.keyframe === 'review' ? '重新生成 · 约 7 秒' : '生成首帧 · 约 7 秒', attributes: { 'data-connection-required': `master:${action}-key` } }),
      ]) : null,
      branch.keyframe === 'review' ? el('button', { className: 'node-action node-action--confirm', type: 'button', text: '确认首帧', attributes: { 'data-confirm-keyframe': action } }) : null,
    ],
  });
}

function renderAnimationNode(snapshot, action, x, y, focus = false, focusGroup = false) {
  const branch = snapshot.actions[action];
  const label = action === 'walk' ? 'Walk 动画' : 'Idle 动画';
  const frames = selectedAssetSet(snapshot)[action];
  const running = jobIsRunning(snapshot, 'animation', action);
  const job = activeJob(snapshot, 'animation', action);
  return graphNode({
    id: `${action}-animation`, eyebrow: `05 · ${action.toUpperCase()}`, title: label, x, y, focus, focusGroup,
    outputEnabled: branch.animation === 'confirmed', className: running ? 'is-running' : '',
    body: [
      nodeStatus('8 FPS · 循环', branch.animation),
      running || ['review', 'confirmed'].includes(branch.animation) ? renderFrameStrip(frames, running ? job?.arrivals || 0 : null, `${label}八帧预览`) : el('p', { text: '首帧确认后，再连接并生成完整动作。' }),
      ['ready', 'review'].includes(branch.animation) ? el('form', { className: 'node-brief-form node-animation-form', attributes: { 'data-animation-form': action } }, [
        el('label', {}, [el('span', { text: '动画 FPS' }), el('select', { attributes: { name: 'fps', required: '' } }, [
          el('option', { text: '请选择', attributes: { value: '' } }),
          ...[8, 12, 16].map((fps) => el('option', { text: `${fps} FPS`, attributes: { value: String(fps) } })),
        ])]),
        el('button', { className: 'node-action', type: 'submit', text: branch.animation === 'review' ? '重新生成 · 约 15 秒' : '生成完整动画 · 约 15 秒', attributes: { 'data-connection-required': `${action}-key:${action}-animation` } }),
      ]) : null,
      branch.animation === 'review' ? el('button', { className: 'node-action node-action--confirm', type: 'button', text: '确认动画', attributes: { 'data-confirm-animation': action } }) : null,
    ],
  });
}

function renderCustomActionNode() {
  return graphNode({
    id: 'custom-action', eyebrow: '04 · CUSTOM', title: '自定义动作', x: 1390, y: 1080, output: false,
    body: [
      nodeStatus('扩展动作', 'ready'),
      el('div', { className: 'node-brief-form custom-action-placeholder' }, [
        el('label', {}, [el('span', { text: '动作名称' }), el('input', { attributes: { placeholder: '例如：攻击、受击、跳跃' } })]),
        el('label', {}, [el('span', { text: '动作描述' }), el('textarea', { attributes: { rows: '3', placeholder: '描述动作意图和关键姿态' } })]),
        el('small', { text: '自定义扩展节点 · 当前不继续生成后续节点' }),
      ]),
    ],
  });
}

function renderPublishNode(snapshot, focus, projectContext, workflowState = {}) {
  const running = jobIsRunning(snapshot, 'publish');
  const upstreamReady = Object.values(snapshot.actions).every((branch) => branch.animation === 'confirmed');
  const previewHref = `./review.html?character=${encodeURIComponent(snapshot.masterCandidate || 'boy')}&view=side&action=walk`;
  return graphNode({
    id: 'publish', eyebrow: '06 · ASSET', title: snapshot.completed ? '项目资产已就绪' : '导入项目资产', x: 2250, y: 330, focus,
    output: false, className: running ? 'is-running' : '',
    body: [
      nodeStatus('双分支校验', snapshot.completed ? 'confirmed' : running ? 'generating' : 'locked'),
      running ? generationVisual(null, '正在保存母版、动作与版本关系', 'package') : null,
      snapshot.completed ? el('div', { className: 'publish-complete' }, [
        el('b', { text: '版本 v1 · 选择下一步' }),
        el('span', { text: '母版、Idle 与 Walk 已完成' }),
        el('div', { className: 'publish-options' }, [
          el('button', { type: 'button', attributes: { 'data-export-pack': '' } }, [
            el('b', { text: '导出资产' }),
            el('small', { text: '下载 SpriteSheet 与 JSON' }),
          ]),
          el('a', { href: previewHref }, [
            el('b', { text: '发送到预览台' }),
            el('small', { text: '检查动作播放与循环效果' }),
          ]),
        ]),
        el('form', { className: 'workflow-save-form', attributes: { 'data-workflow-save-form': '' } }, [
          el('label', {}, [
            el('span', { text: '保存为可复用流程' }),
            el('input', { attributes: { name: 'workflowName', required: '', maxlength: '48', value: `${projectContext?.projectName || snapshot.profile.name} 角色流程` } }),
          ]),
          el('button', { type: 'submit', text: workflowState.saving ? '正在保存…' : '保存流程', attributes: workflowState.saving ? { disabled: '' } : {} }),
          workflowState.message ? el('small', { text: workflowState.message }) : null,
        ]),
      ]) : el('button', {
        className: 'node-action',
        type: 'button',
        text: '确认导入项目资产',
        attributes: {
          'data-publish': '',
          'data-connection-required': 'walk-animation:publish,idle-animation:publish',
          'data-node-ready': String(upstreamReady),
        },
      }),
    ],
  });
}

function renderProjectNode(projectContext) {
  return graphNode({
    id: 'project', eyebrow: '01 · PROJECT', title: projectContext.projectName || '未命名项目', x: 70, y: 70, input: false,
    body: [
      el('dl', { className: 'project-node-facts' }, [
        ['视角', projectLabels[projectContext.view] || '默认视角'],
        ['方向', projectLabels[projectContext.directions] || '默认方向'],
        ['画布', `${projectContext.canvasSize || '256'} × ${projectContext.canvasSize || '256'}`],
      ].map(([term, value]) => el('div', {}, [el('dt', { text: term }), el('dd', { text: value })]))),
      el('p', { text: projectContext.style || '以参考图作为美术约束' }),
    ],
  });
}

function renderDemoBuilder(snapshot, libraryState, projectContext, workflowState, studioMode, naturalState, naturalSettled) {
  if (!studioMode) return renderStudioModeChooser();
  if (studioMode === 'natural') return renderNaturalCreation(naturalState, naturalSettled);
  if (!projectContext) return renderProjectSetup({}, workflowState);
  const restoredWorkflow = Boolean(snapshot.workflow);
  const showGenerator = Boolean(snapshot.source);
  const showMaster = restoredWorkflow || snapshot.master !== 'idle';
  const showKeys = restoredWorkflow || snapshot.master === 'confirmed';
  const showWalkAnimation = restoredWorkflow || snapshot.actions.walk.keyframe === 'confirmed';
  const showIdleAnimation = restoredWorkflow || snapshot.actions.idle.keyframe === 'confirmed';
  const showPublish = restoredWorkflow || snapshot.completed || Object.values(snapshot.actions).some((branch) => branch.animation === 'confirmed');
  const showBranchOverview = showKeys
    && snapshot.actions.walk.keyframe === 'ready'
    && snapshot.actions.idle.keyframe === 'ready';
  const keyframeWorkMode = showKeys && (snapshot.jobs || []).some((job) => job.kind === 'keyframe');
  const animationWorkMode = showWalkAnimation && showIdleAnimation && (snapshot.jobs || []).some((job) => job.kind === 'animation');
  const suggestedFocus = snapshot.actions.walk.keyframe === 'ready' ? 'walk-key'
    : snapshot.actions.walk.animation === 'ready' || snapshot.actions.walk.animation === 'review' ? 'walk-animation'
      : snapshot.actions.idle.keyframe === 'ready' ? 'idle-key'
        : snapshot.actions.idle.animation === 'ready' || snapshot.actions.idle.animation === 'review' ? 'idle-animation'
          : 'master-gen';
  const focusId = snapshot.job?.kind === 'publish' || snapshot.completed ? 'publish'
    : snapshot.job?.kind === 'animation' ? `${snapshot.job.action}-animation`
      : snapshot.job?.kind === 'keyframe' ? `${snapshot.job.action}-key`
        : snapshot.master === 'review' ? 'master'
          : snapshot.master === 'confirmed' ? suggestedFocus
            : snapshot.job?.kind === 'master' || showGenerator ? 'master-gen'
            : 'source';
  return el('section', { className: 'node-graph-workspace', attributes: { 'data-production-status': snapshot.status } }, [
    el('div', { className: 'node-canvas', attributes: { 'data-node-canvas': '' } }, [
      el('div', { className: 'node-surface', attributes: { 'data-node-surface': '' } }, [
        el('svg', { className: 'node-wires', attributes: { 'data-node-wires': '', 'aria-hidden': 'true' } }),
        renderSourceNode(snapshot, focusId === 'source'),
        showGenerator ? renderMasterGenerator(snapshot, focusId === 'master-gen', projectContext, libraryState) : null,
        showMaster ? renderMasterNode(snapshot, focusId === 'master', showBranchOverview || keyframeWorkMode) : null,
        showKeys ? renderKeyframeNode(snapshot, 'walk', 1390, 60, focusId === 'walk-key' && !showBranchOverview && !keyframeWorkMode, showBranchOverview || keyframeWorkMode) : null,
        showKeys ? renderKeyframeNode(snapshot, 'idle', 1390, 570, focusId === 'idle-key' && !showBranchOverview && !keyframeWorkMode, showBranchOverview || keyframeWorkMode) : null,
        showKeys ? renderCustomActionNode() : null,
        showWalkAnimation ? renderAnimationNode(snapshot, 'walk', 1820, 60, focusId === 'walk-animation' && !animationWorkMode, animationWorkMode) : null,
        showIdleAnimation ? renderAnimationNode(snapshot, 'idle', 1820, 570, focusId === 'idle-animation' && !animationWorkMode, animationWorkMode) : null,
        showPublish ? renderPublishNode(snapshot, focusId === 'publish', projectContext, workflowState) : null,
      ]),
      el('div', { className: 'node-canvas-hint' }, [
        el('span', { className: 'node-canvas-hint__copy' }, [
          el('b', { text: snapshot.workflow ? `正在复用：${snapshot.workflow.name}` : showGenerator ? '下一步：拖动端口完成连接' : '第一步：选择角色起点' }),
          el('span', { text: snapshot.workflow ? '填写新角色后，已验证节点将自动按顺序运行' : showGenerator ? '点击虚线终点的卡片即可确认连接 · 实线出现后解锁生成' : '选择后，下一节点才会出现' }),
        ]),
        el('button', { type: 'button', attributes: { 'data-workflow-library-open': '', 'aria-label': `打开流程库，${(workflowState.items || []).length} 个已保存流程` } }, [
          el('span', { text: '流程库' }),
          el('i', { text: String((workflowState.items || []).length) }),
        ]),
      ]),
      el('div', { className: 'node-zoom', attributes: { 'aria-label': '画布缩放' } }, [
        el('button', { type: 'button', text: '−', attributes: { 'aria-label': '缩小画布', 'data-node-zoom-out': '' } }),
        el('output', { text: '100%', attributes: { 'data-node-zoom-label': '', 'aria-live': 'polite' } }),
        el('button', { type: 'button', text: '+', attributes: { 'aria-label': '放大画布', 'data-node-zoom-in': '' } }),
      ]),
    ]),
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

function renderBody(context, demoSnapshot, libraryState, projectContext, workflowState, studioMode, naturalState) {
  if (context.route.id === 'projects') return renderProjectHub(context);
  if (context.route.id === 'library') return renderLibrary(context, libraryState);
  if (context.route.id === 'demoBuilder') return renderDemoBuilder(demoSnapshot, libraryState, projectContext, workflowState, studioMode, naturalState);
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

function renderWorkspace(context, demoSnapshot, libraryState, projectContext, workflowState, studioMode, naturalState, naturalSettled) {
  if (context.route.id === 'demoBuilder') {
    return el('main', { className: 'production-canvas-workspace' }, [renderDemoBuilder(demoSnapshot, libraryState, projectContext, workflowState, studioMode, naturalState, naturalSettled)]);
  }
  const parent = parentIdFor(context) ? routeById(parentIdFor(context)) : null;
  return el('main', { className: 'product-workspace' }, [
    renderBreadcrumbs(context),
    renderPageHeading(context),
    renderJourney(context),
    renderBody(context, demoSnapshot, libraryState, projectContext, workflowState, studioMode, naturalState),
    renderActions(context),
    backHrefFor(context) ? el('footer', { className: 'workspace-footer' }, [
      el('a', { href: backHrefFor(context), text: `← 返回${parent?.title || '上一级'}` }),
      el('span', { text: '当前页面只承载一个明确任务' }),
    ]) : null,
  ]);
}

export function renderWorkflowShell(root, context, options = {}) {
  // Preserve <progress> element across re-renders so CSS transition stays alive
  const oldProgress = root.querySelector('.natural-progress__bar progress');
  const oldProgressValue = oldProgress ? Number(oldProgress.value) : 0;

  root.replaceChildren();
  root.dataset.routeId = context.route.id;
  root.append(context.route.id === 'demoBuilder' ? renderStudioBar(context, options.projectContext, options.workflowState, options.studioMode) : renderHeader(context));
  root.append(context.route.id === 'home' ? renderHome(context) : renderWorkspace(
    context,
    options.demoSnapshot,
    options.libraryState,
    options.projectContext,
    options.workflowState,
    options.studioMode,
    options.naturalState,
    options.naturalSettled,
  ));
  if (context.route.id === 'demoBuilder') {
    const workflowLibrary = renderWorkflowLibrary(options.workflowState);
    if (workflowLibrary) root.append(workflowLibrary);
  }

  // Restore progress element and animate to new value
  const newProgress = root.querySelector('.natural-progress__bar progress');
  if (newProgress && oldProgress && oldProgressValue > 0) {
    newProgress.value = oldProgressValue;
    const targetValue = Number(newProgress.getAttribute('value'));
    requestAnimationFrame(() => { newProgress.value = targetValue; });
  }
}
