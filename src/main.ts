import Expression from "jexl/Expression";
import "./style.css";
import jexl from "jexl";
import JsInterpreter from "js-interpreter";
import { QuickJSContext, QuickJSHandle, getQuickJS } from "quickjs-emscripten";
import "ses";

// lockdown(); // TODO: We should enable this for SES

const QuickJS = await getQuickJS();

const contextInput = document.querySelector<HTMLTextAreaElement>("#context")!;
const contextErrorOutput =
  document.querySelector<HTMLDivElement>("#context-error")!;

const jexlInput =
  document.querySelector<HTMLTextAreaElement>("#jexl .expression")!;
const jexlResultOutput =
  document.querySelector<HTMLTextAreaElement>("#jexl .result")!;
const jexlPerformanceOutput =
  document.querySelector<HTMLDivElement>("#jexl .performance")!;

const jsInterpreterInput = document.querySelector<HTMLTextAreaElement>(
  "#js-interpreter .expression"
)!;
const jsInterpreterResultOutput = document.querySelector<HTMLTextAreaElement>(
  "#js-interpreter .result"
)!;
const jsInterpreterPerformanceOutput = document.querySelector<HTMLDivElement>(
  "#js-interpreter .performance"
)!;

const quickjsEmscriptenInput = document.querySelector<HTMLTextAreaElement>(
  "#quickjs-emscripten .expression"
)!;
const quickjsEmscriptenResultOutput =
  document.querySelector<HTMLTextAreaElement>("#quickjs-emscripten .result")!;
const quickjsEmscriptenPerformanceOutput =
  document.querySelector<HTMLDivElement>("#quickjs-emscripten .performance")!;

const sesInput =
  document.querySelector<HTMLTextAreaElement>("#ses .expression")!;
const sesResultOutput =
  document.querySelector<HTMLTextAreaElement>("#ses .result")!;
const sesPerformanceOutput =
  document.querySelector<HTMLDivElement>("#ses .performance")!;

const benchmarkButton =
  document.querySelector<HTMLButtonElement>("#benchmark")!;
const runTimesInput = document.querySelector<HTMLInputElement>("#run-times")!;

function setQuickJsValue(
  vm: QuickJSContext,
  handle: QuickJSHandle,
  key: string | number,
  value: any
) {
  switch (typeof value) {
    case "string":
      vm.setProp(handle, key, vm.newString(value));
      break;
    case "number":
      vm.setProp(handle, key, vm.newNumber(value));
      break;
    case "boolean":
      vm.setProp(handle, key, value ? vm.true : vm.false);
      break;
    case "object":
      if (Array.isArray(value)) {
        const array = vm.newArray();
        vm.setProp(handle, key, array);
        value.forEach((value, index) => {
          setQuickJsValue(vm, array, index, value);
        });
      } else {
        const object = vm.newObject();
        vm.setProp(handle, key, object);
        Object.entries(value).forEach(([key, value]) => {
          setQuickJsValue(vm, object, key, value);
        });
      }
      break;
    default:
      vm.setProp(handle, key, vm.undefined);
      break;
  }
}

function run<Context, VM>({
  context,
  expression,
  resultElement,
  performanceMetricsElement,
  createVm,
  setContext,
  compileExpression,
  runExpression,
}: {
  context: Context;
  expression: string;
  resultElement: HTMLTextAreaElement;
  performanceMetricsElement: HTMLDivElement;
  createVm?: () => VM;
  compileExpression?: (vm: VM, expression: string) => VM | void;
  setContext?: (vm: VM, context: Context) => VM | void;
  runExpression: (vm: VM, expression: string, context: Context) => any;
}) {
  const perfMeasurements: number[] = [];
  const runTimes = runTimesInput.valueAsNumber;

  let start = performance.now();

  try {
    let vm = createVm?.() as VM;
    perfMeasurements.push(performance.now() - start);

    start = performance.now();
    vm = compileExpression?.(vm, expression) ?? vm;
    perfMeasurements.push(performance.now() - start);

    start = performance.now();
    vm = setContext?.(vm, context) ?? vm;
    perfMeasurements.push(performance.now() - start);

    const times = [];
    let result: any;
    for (let i = 0; i < runTimes; i++) {
      start = performance.now();
      result = runExpression(vm, expression, context);
      times.push(performance.now() - start);
    }
    // Mean of N runs
    perfMeasurements.push(times.reduce((p, x) => p + x) / times.length);

    resultElement.value = JSON.stringify(result, null, 2);
    resultElement.classList.remove("error");
  } catch (error) {
    console.log(error);
    resultElement.value = (error as Error).message;
    resultElement.classList.add("error");
  }

  performanceMetricsElement.textContent =
    perfMeasurements.map((ms) => `${ms.toFixed(2)} ms`).join(" + ") +
    ` = ${perfMeasurements.reduce((p, x) => p + x).toFixed(2)} ms`;
}

function runAll() {
  try {
    const context = JSON.parse(contextInput.value);
    contextErrorOutput.textContent = null;

    // JEXL
    run<any, Expression>({
      context,
      expression: jexlInput.value,
      resultElement: jexlResultOutput,
      performanceMetricsElement: jexlPerformanceOutput,
      compileExpression: (_, expression) => {
        return jexl.compile(expression);
      },
      runExpression: (jexl, _, context) => {
        return jexl.evalSync(context);
      },
    });

    // JS-Interpreter
    run({
      context,
      expression: jsInterpreterInput.value,
      resultElement: jsInterpreterResultOutput,
      performanceMetricsElement: jsInterpreterPerformanceOutput,
      runExpression: (_, expression, context) => {
        let result: any;
        let error: any;
        const interpreter = new JsInterpreter(
          `try { resolve(${expression}) } catch(error) { reject(error) }`,
          function init(interpreter: any, globalObject: any) {
            interpreter.setProperty(
              globalObject,
              "resolve",
              interpreter.createNativeFunction((value: any) => {
                result = value;
              })
            );
            interpreter.setProperty(
              globalObject,
              "reject",
              interpreter.createNativeFunction((value: any) => {
                error = value;
              })
            );
            Object.entries(context).forEach(([key, value]) => {
              interpreter.setProperty(
                globalObject,
                key,
                interpreter.nativeToPseudo(value)
              );
            });
          }
        );
        interpreter.run();

        if (error) {
          throw new Error(error.message);
        }
        return result;
      },
    });

    // quickjs-emscripten
    run({
      context,
      expression: quickjsEmscriptenInput.value,
      resultElement: quickjsEmscriptenResultOutput,
      performanceMetricsElement: quickjsEmscriptenPerformanceOutput,
      createVm: () => QuickJS.newContext(),
      setContext: (vm, context) => {
        Object.entries(context).forEach(([key, value]) => {
          setQuickJsValue(vm, vm.global, key, value);
        });
        // TODO: dispose context values
      },
      runExpression: (vm, expression) => {
        const result = vm.evalCode(expression);
        if (result.error) {
          const error = vm.dump(result.error);
          result.error.dispose();
          throw new Error(error);
        } else {
          const jsResult = vm.dump(result.value);
          result.value.dispose();
          return jsResult;
        }
      },
    });

    // SES
    run<any, Compartment>({
      context,
      expression: sesInput.value,
      resultElement: sesResultOutput,
      performanceMetricsElement: sesPerformanceOutput,
      setContext: (_, context) => {
        return new Compartment(context);
      },
      runExpression: (vm, expression) => {
        return vm.evaluate(expression);
      },
    });
  } catch (error) {
    console.log(error);
    contextErrorOutput.textContent = (error as Error).message;
    return;
  }
}

let runAutomaticallyTimeout: number | null = null;
document.addEventListener("keyup", (event) => {
  if (event.target instanceof HTMLTextAreaElement) {
    const newExpression = event.target.value;
    [jexlInput, jsInterpreterInput, quickjsEmscriptenInput, sesInput].forEach(
      (element) => {
        element.value = newExpression;
      }
    );

    if (runAutomaticallyTimeout) {
      clearTimeout(runAutomaticallyTimeout);
    }
    runAutomaticallyTimeout = setTimeout(runAll, 250);
  }
});

benchmarkButton.addEventListener("click", (e) => {
  e.preventDefault();
  runAll();
});

runAll();
