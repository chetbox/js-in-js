import Expression from "jexl/Expression";
import "./style.css";
import jexl from "jexl";
import JsInterpreter from "js-interpreter";
import { QuickJSContext, QuickJSHandle, getQuickJS } from "quickjs-emscripten";
import "ses";

// lockdown(); // TODO: We should enable this for SES but it breaks JS-Interpreter

const QuickJS = await getQuickJS();

const globalsInput = document.querySelector<HTMLTextAreaElement>("#globals")!;
const globalsErrorOutput =
  document.querySelector<HTMLDivElement>("#globals-error")!;

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

function run<Globals, VM, GlobalsResult = void>({
  globals,
  expression,
  resultElement,
  performanceMetricsElement,
  createVm,
  setGlobals,
  compileExpression,
  runExpression,
}: {
  globals: Globals;
  expression: string;
  resultElement: HTMLTextAreaElement;
  performanceMetricsElement: HTMLDivElement;
  createVm?: (globals: Globals) => VM;
  compileExpression?: (vm: VM, expression: string) => VM | void;
  setGlobals?: (vm: VM, globals: Globals) => GlobalsResult;
  runExpression: (
    vm: VM,
    expression: string,
    globals: Globals,
    globalsResult: GlobalsResult
  ) => any;
}) {
  const perfMeasurements: Partial<
    Record<"create VM" | "compile expr" | "set globals" | "run (avg)", number>
  > = {};
  const runTimes = runTimesInput.valueAsNumber;

  let start = performance.now();

  try {
    let vm = createVm?.(globals) as VM;
    if (createVm) {
      perfMeasurements["create VM"] = performance.now() - start;
    }

    start = performance.now();
    vm = compileExpression?.(vm, expression) ?? vm;
    if (compileExpression) {
      perfMeasurements["compile expr"] = performance.now() - start;
    }

    start = performance.now();
    const globalsResult = setGlobals?.(vm, globals);
    if (setGlobals) {
      perfMeasurements["set globals"] = performance.now() - start;
    }

    const times = [];
    let result: any;
    for (let i = 0; i < runTimes; i++) {
      start = performance.now();
      result = runExpression(
        vm,
        expression,
        globals,
        globalsResult as GlobalsResult
      );
      times.push(performance.now() - start);
    }
    // Mean of N runs
    perfMeasurements["run (avg)"] =
      times.reduce((p, x) => p + x) / times.length;

    resultElement.value = JSON.stringify(result, null, 2);
    resultElement.classList.remove("error");
  } catch (error) {
    console.log(error);
    resultElement.value = (error as Error).message;
    resultElement.classList.add("error");
  }

  performanceMetricsElement.innerHTML = `<table><tbody><tr>${Object.keys(
    perfMeasurements
  )
    .map((label) => `<th>${label}</th>`)
    .join("")}</tr><tr>${Object.values(perfMeasurements)
    .map((num) => `<td>${num.toFixed(3)} ms</td>`)
    .join("")}</tr></tbody></table>`;
}

type CogsSesCompartment = Compartment & {
  /** placeholder for the function to compute the final value */
  __getValue: () => unknown;
  /** placeholder global values*/
  __globals: Record<string, any>;
};

function runAll() {
  try {
    const globals = JSON.parse(globalsInput.value);
    globalsErrorOutput.textContent = null;

    // JEXL
    run<any, Expression>({
      globals,
      expression: jexlInput.value,
      resultElement: jexlResultOutput,
      performanceMetricsElement: jexlPerformanceOutput,
      compileExpression: (_, expression) => {
        return jexl.compile(expression);
      },
      runExpression: (jexl, _, globals) => {
        return jexl.evalSync(globals);
      },
    });

    // JS-Interpreter
    run({
      globals: globals,
      expression: jsInterpreterInput.value,
      resultElement: jsInterpreterResultOutput,
      performanceMetricsElement: jsInterpreterPerformanceOutput,
      runExpression: (_, expression, globals) => {
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
            Object.entries(globals).forEach(([key, value]) => {
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
      globals: globals,
      expression: quickjsEmscriptenInput.value,
      resultElement: quickjsEmscriptenResultOutput,
      performanceMetricsElement: quickjsEmscriptenPerformanceOutput,
      createVm: () => QuickJS.newContext(),
      setGlobals: (vm, globals) => {
        Object.entries(globals).forEach(([key, value]) => {
          setQuickJsValue(vm, vm.global, key, value);
        });
        // TODO: dispose globals values
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
    run<any, CogsSesCompartment>({
      globals,
      expression: sesInput.value,
      resultElement: sesResultOutput,
      performanceMetricsElement: sesPerformanceOutput,
      createVm(globals) {
        const compartment = new Compartment() as CogsSesCompartment;
        compartment.__getValue = () => undefined;
        compartment.__globals = {};

        // Lazy getters for global values
        for (const key in globals) {
          Object.defineProperty(compartment.globalThis, key, {
            get() {
              return compartment.__globals[key];
            },
          });
        }

        return compartment;
      },
      compileExpression(compartment, expression) {
        compartment.__getValue = new compartment.globalThis.Function(
          `return (${expression || "undefined"});`
        );
      },
      setGlobals(compartment, globals) {
        compartment.__globals = globals;
      },
      runExpression(compartment) {
        // Use .call with a `this` value when calling the function (1st arg) so the `this` part of from globals can be accessed (otherwise it is just a reference to the globalThis object)
        return compartment.__getValue.call(globals?.this);
      },
    });
  } catch (error) {
    console.log(error);
    globalsErrorOutput.textContent = (error as Error).message;
    return;
  }
}

let runAutomaticallyTimeout: number | null = null;
document.addEventListener("keyup", (event) => {
  const inputs = [
    jexlInput,
    jsInterpreterInput,
    quickjsEmscriptenInput,
    sesInput,
  ];
  if (
    event.target instanceof HTMLTextAreaElement &&
    inputs.includes(event.target)
  ) {
    const newExpression = event.target.value;
    inputs
      .filter((input) => input !== event.target)
      .forEach((element) => {
        element.value = newExpression;
      });
  }

  if (runAutomaticallyTimeout) {
    clearTimeout(runAutomaticallyTimeout);
  }
  runAutomaticallyTimeout = setTimeout(runAll, 250);
});

benchmarkButton.addEventListener("click", (e) => {
  e.preventDefault();
  runAll();
});

runAll();
