import {
  Machine,
  interpret,
  send,
  sendParent,
  assign,
  spawn,
  forwardTo
} from "xstate";

const invokeFromInventory = (context, event, machine) => {
  let src;
  return Machine(
    {
      id: "invokeFromInventory",
      context: {},
      initial: "fetching",
      states: {
        fetching: {
          invoke: {
            id: "fetchMachine",
            src: context => {
              src = context.src;
              return getMachineById(context.src);
            },
            onDone: {
              target: "runningOnSpawn"
            },
            onError: {
              actions: [
                sendParent({
                  type: "xstate.error",
                  get data() {
                    return `Cannot fetch "${src}" from inventory in 'invokeFromInventory'.`;
                  }
                })
              ]
            }
          }
        },
        runningOnSpawn: {
          onEntry: [
            assign({
              ref: (context, event) => {
                const interpreter = spawn(
                  event.data.withContext(context.data),
                  {
                    autoForward: true,
                    name: "invokeMachine"
                  }
                );
                return interpreter;
              }
            }),
            (context, event, machine) => {
              const childInterpreter = context.ref;
              const currentInterpreter = childInterpreter.parent;
              const parentInterpreter = currentInterpreter.parent;
              console.warn({ childInterpreter, parentInterpreter });
              childInterpreter.eventListeners =
                parentInterpreter.eventListeners;
              const id = context.id || context.src;
              // Prevent emitting ready event if invoked machine is no longer in use
              if (parentInterpreter.children.has(id)) {
                parentInterpreter.send(`ready.invokeFromInventory.${id}`);
              }
            }
          ],
          on: {
            "done.invoke.invokeMachine": "done",
            "*": {
              // check if event have come from invoked nested machine
              cond: (context, event, machine) => {
                const childInterpreter = context.ref;
                return machine._event.origin === childInterpreter.sessionId;
              },
              actions: (context, event, machine) => {
                const childInterpreter = context.ref;
                const currentInterpreter = childInterpreter.parent;
                const parentInterpreter = currentInterpreter.parent;
                parentInterpreter.send(event);
              }
            }
          }
        },
        runningOnInvoke: {
          onEntry: [
            (context, event, machine) => {
              const childInterpreter = machine.state.children.invokeMachine;
              const currentInterpreter = childInterpreter.parent;
              const parentInterpreter = currentInterpreter.parent;
              const id = context.id || context.src;
              // Prevent emitting ready event if invoked machine is no longer in use
              if (parentInterpreter.children.has(id)) {
                parentInterpreter.send(`ready.invokeFromInventory.${id}`);
              }
            }
          ],
          invoke: {
            id: "invokeMachine",
            src: (context, event) => event.data,
            data: context => context.data,
            onDone: "done",
            autoForward: true
          },
          on: {
            "*": {
              // check if event have come from invoked nested machine
              cond: (context, event, machine) => {
                const childInterpreter = machine.state.children.invokeMachine;
                return machine._event.origin === childInterpreter.sessionId;
              },
              actions: (context, event, machine) => {
                const childInterpreter = machine.state.children.invokeMachine;
                const currentInterpreter = childInterpreter.parent;
                const parentInterpreter = currentInterpreter.parent;
                parentInterpreter.send(event);
              }
            }
          }
        },
        done: {
          type: "final",
          data: (_, event) => event.data
        }
      }
    },
    {}
  );
};

const transform = (config, preventLog) => {
  Object.keys(config).forEach(key => {
    if (key === "invokeFromInventory" && typeof config[key] === "object") {
      if (config.hasOwnProperty("invoke")) {
        throw new Error(
          "Cannot use `invokeFromInventory` while `invoke` is used."
        );
      }
      const invokeFromInventory = config[key];
      delete config[key];
      const id = invokeFromInventory.id || invokeFromInventory.src;
      config.invoke = {
        id,
        src: "invokeFromInventory",
        autoForward: invokeFromInventory.autoForward,
        data: {
          id,
          src: invokeFromInventory.src,
          data: invokeFromInventory.data || {}
        },
        onDone: invokeFromInventory.onDone,
        onError: invokeFromInventory.onError
      };
      if (invokeFromInventory.onReady) {
        if (!config.on) {
          config.on = {};
        }
        if (!config.on[id]) {
          config.on[`ready.invokeFromInventory.${id}`] =
            invokeFromInventory.onReady;
        }
      }
    }
    if (typeof config[key] === "object") {
      transform(config[key], true);
    }
  });
  if (!preventLog) {
    console.log("config", config);
  }
  return config;
};

const inventory = {
  machine0: Machine(
    transform({
      id: "machine0",
      initial: "idle",
      states: {
        idle: {
          on: {
            "": "pending"
          }
        },
        pending: {
          invokeFromInventory: {
            autoForward: true,
            id: "my-machine-1",
            src: "machine1",
            data: {
              param1: "value1",
              param2: "value2"
            },
            onReady: {
              target: ".ready",
              actions: [
                send(
                  { type: "TEST_1", onReady: true },
                  { to: "my-machine-1", delay: 0 }
                )
              ]
            },
            onError: {
              target: "done",
              actions: (context, event) => {
                console.error(event);
              }
            }
          },
          // on: {
          //   "ready.invokeFromInventory.my-machine-1": {
          //     actions: [
          //       send({ type: "TEST_1", on: true }, { to: "my-machine-1" })
          //     ]
          //   }
          // },
          initial: "loading",
          states: {
            loading: {
              onEntry: () => console.log("loading entry"),
              on: {
                // More nested listener catches event first and event is no longer "bubbled up"
                // "ready.invokeFromInventory.my-machine-1": {
                //   target: "ready",
                //   actions: [
                //     send(
                //       { type: "TEST_1", loading: true },
                //       { to: "my-machine-1" }
                //     )
                //   ]
                // }
              }
            },
            ready: {
              onEntry: [
                send({ type: "TEST_1", ready: true }, { to: "my-machine-1" })
              ]
            }
          },
          onEntry: [
            send(
              { type: "TEST_1", onEntry: true },
              { to: "my-machine-1", delay: 0 }
            )
          ],
          after: {
            4000: "done"
          }
        },
        ready: {},
        done: {
          onEntry: [() => console.log("done!")]
        }
      }
    }),
    {
      services: {
        invokeFromInventory
      }
    }
  ),
  machine1: Machine(
    transform({
      id: "machine1",
      initial: "running",
      states: {
        running: {
          onEntry: [context => console.log("machine1 started", context)],
          onExit: [() => console.log("machine1 existing running state...")],
          activities: ["beeping"],
          invokeFromInventory: {
            autoForward: true,
            id: "my-machine-2",
            src: "machine2",
            // onDone: "logging",
            onReady: {
              // actions: [send("TEST_1", { to: "my-machine-2" })]
            }
          },
          on: {
            "done.invoke.my-machine-2": "logging",
            TEST_1: {
              actions: [
                (_, event) => {
                  console.warn(
                    "received event in machine1 from machine0!",
                    event
                  );
                },
                forwardTo("my-machine-2")
              ]
            },
            FROM_CHILD: {
              actions: [
                (_, event) =>
                  console.warn(
                    "received event in machine1 from machine2!",
                    event
                  )
              ]
            }
          }
        },
        logging: {
          onEntry: [
            (_, event) => console.log("machine2 finished with", event.data)
          ]
        }
      }
    }),
    {
      services: {
        invokeFromInventory
      },
      activities: {
        beeping: () => {
          const interval = setInterval(
            () => console.log("machine1 BEEP!"),
            250
          );
          return () => clearInterval(interval);
        }
      }
    }
  ),
  
  machine2: Machine(
    transform({
      id: "machine2",
      initial: "start",
      states: {
        start: {
          onEntry: [
            context => console.log("machine2 started", context),
            sendParent("FROM_CHILD")
          ],
          onExit: [],
          on: {
            TEST_1: {
              actions: (context, event) =>
                console.error(
                  "received event in machine2 from machine1!",
                  event
                )
            }
          },
          after: {
            500: "stop"
          }
        },
        stop: {
          onEntry: [() => console.log("machine2 stopping...")],
          type: "final",
          data: {
            output: "some value"
          }
        }
      }
    })
  ),
  
  launch: Machine(
    transform({
      id: "launch",
      initial: "start",
      states: {
        start: {
          invokeFromInventory: {
            src: "machine3"
          },
          after: {
            1000: "stop"
          }
        },
        stop: {
          onEntry: [() => console.error("STOP")]
        }
      }
    }),
    {
      services: {
        invokeFromInventory
      }
    }
  ),
  
  machine3: Machine(
    transform({
      id: "machine3",
      initial: "idle",
      states: {
        idle: {
          invokeFromInventory: {
            src: "beeper"
          }
        }
      }
    }),
    {
      services: {
        invokeFromInventory
      }
    }
  ),
  
  beeper: Machine(
    transform({
      id: "beeper",
      initial: "idle",
      states: {
        idle: {
          onEntry: [() => console.error("beeping!")],
          activities: ["beeping"]
        }
      }
    }),
    {
      activities: {
        beeping: () => {
          const interval = setInterval(() => console.log("machine1 BEEP!"), 50);
          return () => clearInterval(interval);
        }
      }
    }
  )
};

const getMachineById = id =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      if (inventory.hasOwnProperty(id)) {
        // console.log("machine", inventory[id]);
        resolve(inventory[id]);
      } else {
        reject(`Cannot resolve machine "${id}".`);
      }
    }, 100);
  });

const machine = Machine(
  transform({
    id: "root",
    initial: "running",
    states: {
      running: {
        invokeFromInventory: {
          autoForward: true,
          src: "launch"
        }
      }
    }
  }),
  {
    services: {
      invokeFromInventory
    }
  }
);

const interpreter = interpret(machine, { execute: true, devTools: true });
// console.log(interpreter);
interpreter.onTransition(state => {
  console.log("state", state);
  // interpreter.execute(state);
});
// interpreter.onChange(change => {
//   console.log("change", change);
// });
interpreter.onEvent(event => {
  console.log("event", event);
});
// interpreter.onSend(action => {
//   console.log("action", action);
// });
interpreter.start();
// setTimeout(() => {
//   interpreter.send("OMG");
// }, 4000);
