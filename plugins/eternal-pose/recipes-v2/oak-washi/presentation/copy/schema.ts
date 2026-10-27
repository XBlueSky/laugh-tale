export interface OakWashiMetadataCopy {
  productName: string;
  setupTitle: string;
  setupDescription: string;
}

export interface OakWashiCopy {
  accessibleNames: {
    candidateDialog: string;
    collapseDayRail: string;
    collapseSheet: string;
    dayRail: string;
    expandDayRail: string;
    expandSheet: string;
    header: string;
    itinerarySheet: string;
    map: string;
    marker: string;
    openDetails: string;
    route: string;
    userLocation: string;
  };
  booking: {
    confirmed: string;
    none: string;
    open: string;
    pending: string;
    reference: string;
  };
  candidate: {
    browse: string;
    cancel: string;
    confirm: string;
    draft: string;
    open: string;
    preview: string;
    reopen: string;
    selected: string;
    single: string;
    title: string;
    unresolved: string;
  };
  certainty: {
    candidate: string;
    confirmed: string;
    suggested: string;
    unverified: string;
  };
  experience: {
    collapseDayRail: string;
    collapseSheet: string;
    day: string;
    dayOfTrip: string;
    expandDayRail: string;
    expandSheet: string;
    home: string;
    itinerary: string;
    mapCoverageNone: string;
    mapCoveragePartial: string;
    primaryCount: string;
    summary: string;
    tripTime: string;
  };
  facts: {
    area: string;
    arrivalBuffer: string;
    base: string;
    bus: string;
    checkIn: string;
    checkOut: string;
    checklist: string;
    cuisine: string;
    customKind: string;
    duration: string;
    false: string;
    meters: string;
    mode: string;
    must: string;
    nice: string;
    plan: string;
    priority: string;
    rail: string;
    return: string;
    status: string;
    terminal: string;
    true: string;
    unverifiedLocation: string;
    unverifiedLocationConsequence: string;
  };
  fatal: {
    externalNavigationRetained: string;
    homeRetained: string;
    itineraryRetained: string;
    openHome: string;
    provider: string;
    render: string;
    retry: string;
    state: string;
    title: string;
  };
  home: {
    dates: string;
    days: string;
    destination: string;
    lodging: string;
    noLodging: string;
    noReservations: string;
    noTasks: string;
    openDay: string;
    openExperience: string;
    reservations: string;
    tasks: string;
    title: string;
    travelers: string;
  };
  loading: {
    experience: string;
    home: string;
    location: string;
    map: string;
    places: string;
    progress: string;
    routes: string;
    title: string;
  };
  location: {
    active: string;
    denied: string;
    idle: string;
    locate: string;
    recenter: string;
    requesting: string;
    stop: string;
    unavailable: string;
    waitingForFix: string;
  };
  metadata: OakWashiMetadataCopy;
  navigation: {
    open: string;
    restoreFullDay: string;
    returnToCurrent: string;
    returnToLodging: string;
    unavailable: string;
  };
  openingHours: {
    absent: string;
    alwaysOpen: string;
    closed: string;
    incomplete: string;
    invalid: string;
    open: string;
    permanentlyClosed: string;
    temporarilyClosed: string;
    unknown: string;
  };
  persistence: {
    manageProgress: string;
    resetDayScope: string;
    confirmReset: string;
    cancelReset: string;
    resetExplanation: string;
    resetDone: string;
    memoryOnly: string;
    memoryOnlyNotice: string;
    persistent: string;
    resetDay: string;
    resetTrip: string;
  };
  progress: {
    complete: string;
    completedOfTotal: string;
    markComplete: string;
    markIncomplete: string;
    pending: string;
    purchased: string;
    restore: string;
    skip: string;
    skipped: string;
    unavailable: string;
  };
  provider: {
    cancelled: string;
    idle: string;
    implausibleResult: string;
    loaderFailed: string;
    loading: string;
    malformedResponse: string;
    map: string;
    missingConfiguration: string;
    network: string;
    notFound: string;
    places: string;
    ready: string;
    requestDenied: string;
    retry: string;
    routes: string;
    unavailable: string;
    unsupported: string;
  };
  roles: {
    base: string;
    connector: string;
    journey: string;
    logisticsGroup: string;
    primary: string;
    task: string;
  };
  routes: {
    authoredFallback: string;
    distance: string;
    driving: string;
    duration: string;
    external: string;
    flight: string;
    idle: string;
    loading: string;
    manual: string;
    noDetails: string;
    provider: string;
    ready: string;
    recomposed: string;
    retry: string;
    steps: string;
    transit: string;
    unavailable: string;
    unknown: string;
    walking: string;
  };
  setup: {
    invalidTrip: string;
    missingTrip: string;
    retry: string;
    title: string;
  };
  status: {
    candidate: string;
    completed: string;
    current: string;
    next: string;
    selected: string;
    skipped: string;
    unresolved: string;
    viewing: string;
  };
  timeline: {
    logisticsGroup: string;
  };
  timing: {
    end: string;
    fixed: string;
    nextDay: string;
    range: string;
    start: string;
    suggested: string;
    unknown: string;
    untimed: string;
  };
  types: {
    custom: string;
    dining: string;
    experience: string;
    lodging: string;
    logistics: string;
    shopping: string;
    sightseeing: string;
    transfer: string;
    transport: string;
  };
}
