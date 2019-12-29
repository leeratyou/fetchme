import merge from 'deepmerge'
import { HAS_SYMBOL, NO_DOMAIN, NO_ENDPOINT, SHOULD_DEFINE_API } from './strings'
import {
  Api,
  Dictionary,
  EndpointsDictionary,
  error,
  isApi, isFetchme,
  isFullUrl,
  Method,
  Middleware,
  MiddlewareTarget,
  Options,
  pipe,
  StringFactory,
  success
} from "./utils";
import { statusNotOk, stringify, takeJson, keyConvert } from "./middleware";

interface Fetchme {
  new(apis?: Api | Dictionary<Api>): Fetchme
}

class Fetchme implements Fetchme {
  
  constructor(apis?: Api | Dictionary<Api>) {
    // TODO Under construction
    // TODO Need to be able pass string as well
    if (apis) this.setApis(apis)
  }
  
  private setApis(apis: Api | Dictionary<Api>) {
    // TODO Under construction
    if (isApi(apis)) {
      this.apis = {...this.apis, [apis.name]: apis}
    } else {
      this.apis = apis
    }
  }
  
  apis?: Dictionary<Api> = {}
  
  options: Options = {
    method: Method.GET,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json; charset=utf-8'
    }
  }
  
  // Make body resetable after calling
  // TODO Check proper body resetability (should write test?) and if dont work - need 'reset' method
  private _body: Dictionary<any> | FormData | undefined = undefined
  
  get body() {
    if (!this._body) return {}
    const temp = this._body
    this._body = undefined
    return { body: temp }
  }
  set body(newValue) {
    this._body = pipe(...this.middleware.body)(newValue)
  }
  
  // TODO Need way to define pipe or compose
  middleware: Middleware = {
    body: [stringify],
    response: [statusNotOk, takeJson],
    resolve: [],
    reject: []
  }
  
  domain: string | undefined = undefined
  endpoint: string | StringFactory | undefined = undefined
  query: string = ''
  arguments: Array<string | number> = []
  
  private fetch(url: string, options: any) {
    return new Promise((resolve, reject) => {
      fetch(url, options)
        .then((response: Response) => {
          return pipe(...this.middleware.response)(response)
        })
        .then((json: unknown) => {
          resolve(success(pipe(...this.middleware.resolve)(json)))
        })
        .catch((e: any) => {
          reject(error(pipe(...this.middleware.reject)(e)))
        })
    })
  }
  
  private endpointsFactory = (endpoints?: EndpointsDictionary): Fetchme | EndpointsDictionary => {
    if (!endpoints) throw error(NO_ENDPOINT)
    const that = this
    
    return new Proxy(endpoints, {
      get(target, prop) {
        if (typeof prop === 'symbol') throw error(HAS_SYMBOL)
        if (!target[prop]) throw error(NO_ENDPOINT)
        
        if (typeof target[prop] === 'function') {
          that.endpoint = target[prop] as StringFactory
          return that
        }
        if (typeof target[prop] === 'object') return that.endpointsFactory(target[prop] as EndpointsDictionary)
      }
    })
  }
  
  private parser(url: string) {
    const parsed = new URL(url)
    this.domain = parsed.origin
    this.endpoint = parsed.pathname
  }
  
  private mapper = (api: string | number | undefined): any => {
    if (isFullUrl(api)) {
      this.parser(api)
      return this
    }
    if (!this.domain && !api) throw error(SHOULD_DEFINE_API)
    this.domain = this.apis?.[api!]?.domain || this.domain
    return this.endpointsFactory(this.apis?.endpoints)
  }
  
  /* PUBLIC METHODS */
  
  from(api?: any) {
    return this.mapper(api)
  }
  
  to(api?: any) {
    return this.mapper(api)
  }
  
  get(query?: Dictionary<any>) {
    this.query = query ? Object.keys(query).reduce((str, curr) => `${str}${curr}=${query[curr]}&`, '?') : ''
    this.options.method = Method.GET
    return this
  }
  
  post(body: Dictionary<any>) {
    this.options.method = Method.POST
    this.body = body
    return this
  }
  
  put(body: Dictionary<any>) {
    this.options.method = Method.PUT
    this.body = body
    return this
  }
  
  delete() {
    this.options.method = Method.DELETE
    return this
  }
  
  upload(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    this.options.method = Method.POST
    // @ts-ignore
    this.body = formData
    return this
  }
  
  with(...args: Array<string | number>) {
    this.arguments = args
    return this
  }
  
  setOptions(options: Options) {
    this.options = merge(this.options, options)
    return this
  }
  
  setApi(to: string) {
    this.mapper(to)
    return this
  }
  
  // FIXME Shouldnt be push here
  addMiddleware(to: MiddlewareTarget, ...middleware: any[]) {
    // TODO Enum type guard of 'to'
    this.middleware[to].push(...middleware)
    return this
  }
  
  plz() {
    if (!this.domain) return Promise.reject(error(NO_DOMAIN))
    if (!this.endpoint) return Promise.reject(error(NO_ENDPOINT))
    
    const options = {
      ...this.options,
      ...this.body
    }
    const endpoint = typeof this.endpoint === 'function' ? this.endpoint(...this.arguments) : this.endpoint
    const query = this.query.replace(/&$/, '')
    const url = `${this.domain}${endpoint}${query}`.replace(/([^:]\/)\/+/g, '$1')
    
    return this.fetch(url, options)
  }
  
}

class Repository {
  
  constructor(apis: Dictionary<Api>, fetcher: Fetchme | any) {
    this.apis = apis
    this.fetcher = isFetchme(fetcher) ? new Fetchme(apis) : fetcher
  }
  
  private apis: Dictionary<Api>
  
  private fetcher: Fetchme
}

export {
  Fetchme,
  Repository,
  keyConvert
}

export default Fetchme
