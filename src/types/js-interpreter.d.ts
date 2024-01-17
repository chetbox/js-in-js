declare module "js-interpreter" {
  export default class JsInterpreter {
    constructor(
      code: string,
      initFunc: (interpreter: any, globalObject: any) => void
    );
    run(): void;
  }
}
