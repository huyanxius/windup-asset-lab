import {
  DEMO_ROUTE_PARAMS,
  ROUTE_BY_ID,
  WORKFLOW_ROUTES,
  hashFor,
  routeById,
} from '../data/workflow-routes.js';

function matcherFor(route) {
  const keys = [];
  const pattern = route.path.replace(/:([a-zA-Z]+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });
  return { keys, regex: new RegExp(`^${pattern}/?$`) };
}

const matchers = WORKFLOW_ROUTES.map((route) => ({ route, ...matcherFor(route) }));

export function parseWorkflowLocation(hash = location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, queryString = ''] = raw.split('?');
  for (const matcher of matchers) {
    const match = path.match(matcher.regex);
    if (!match) continue;
    const params = { ...DEMO_ROUTE_PARAMS };
    matcher.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(match[index + 1]);
    });
    return {
      params,
      query: new URLSearchParams(queryString),
      route: matcher.route,
    };
  }
  return { params: { ...DEMO_ROUTE_PARAMS }, query: new URLSearchParams(), route: ROUTE_BY_ID.home };
}

export function parentIdFor(context) {
  const { query, route } = context;
  if (route.id === 'exportSelect') return query.get('origin') === 'outfit' ? 'outfit' : 'library';
  return route.parent;
}

export function hrefForAction(action, params = DEMO_ROUTE_PARAMS, currentQuery = new URLSearchParams()) {
  if (action.href) return action.href;
  const inheritedQuery = currentQuery instanceof URLSearchParams
    ? Object.fromEntries(currentQuery)
    : currentQuery;
  return hashFor(action.to, { params, query: { ...inheritedQuery, ...action.query } });
}

export function backHrefFor(context) {
  const parentId = parentIdFor(context);
  return parentId ? hashFor(parentId, {
    params: context.params,
    query: Object.fromEntries(context.query),
  }) : null;
}

export function exitHrefFor(context) {
  return context.route.exit ? hashFor(context.route.exit, { params: context.params }) : null;
}

export function breadcrumbsFor(context) {
  const crumbs = [];
  const seen = new Set();
  let current = context.route;
  let first = true;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    crumbs.unshift({
      href: hashFor(current.id, {
        params: context.params,
        query: Object.fromEntries(context.query),
      }),
      id: current.id,
      title: current.title,
    });
    const parentId = first ? parentIdFor(context) : current.parent;
    current = parentId ? routeById(parentId) : null;
    first = false;
  }
  return crumbs;
}

export function navigationContractErrors() {
  const errors = [];
  const ids = new Set(WORKFLOW_ROUTES.map((route) => route.id));
  for (const route of WORKFLOW_ROUTES) {
    if (route.parent && !ids.has(route.parent)) errors.push(`${route.id}: missing parent ${route.parent}`);
    if (route.exit && !ids.has(route.exit)) errors.push(`${route.id}: missing exit ${route.exit}`);
    for (const action of route.actions) {
      if (action.to && !ids.has(action.to)) errors.push(`${route.id}: missing action target ${action.to}`);
      if (!action.to && !action.href) errors.push(`${route.id}: action ${action.label} has no target`);
    }
  }
  return errors;
}
