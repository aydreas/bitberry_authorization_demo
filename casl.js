const { ApolloServer } = require('apollo-server')
const { makeExecutableSchema } = require('@graphql-tools/schema')
const { applyMiddleware } = require('graphql-middleware');
const { AbilityBuilder, Ability, subject} = require('@casl/ability');
const { pick } = require('./pick');
const { permittedFieldsOf } = require('@casl/ability/extra');

const typeDefs = `
type Post {
    name: String
    user: Int
}

input PostInput {
    name: String
    user: Int
}

type Query {
  ping(name: String): String
  GetPost(name: String): [Post]
}

type Mutation {
    AddPost(data: PostInput): Boolean,
    DeletePost(name: String): Boolean
}
`
const resolvers = {
    Query: {
        ping: (root, args, context, info) => {
            return `Hello${args.name ? ' ' + args.name : ''}!`
        },
        GetPost: (root, args, context, info) => {
            return [{
                name: `Post1 von User1`,
                user: 1
            }, {
                name: `Post2 von User2`,
                user: 2
            }]
        }
    },
    Mutation: {
        AddPost: (root, args, context, info) => {
            return true;
        },
        DeletePost: (root, args, context, info) => {
            return true;
        },
    }
}

const defineAbilityFor = (context) => {
    const { can, cannot, build } = new AbilityBuilder(Ability);
    can('query', 'ping'); // Let everyone query the 'ping' resource

    if (context.user) { // Some user is logged in
        can('query', 'GetPost', [ 'name' ]); // Logged in users are allowed to query the attribute 'name'
        can('query', 'GetPost', [ 'name', 'user' ], { user: { $in: [1, 4] } }); // Resources with user 1 or 4 are allowed to query 'name' and 'user'

        if (context.user.role === 'moderator') {
            can('query', 'all'); // Allow moderators to query everything
            can('mutate', 'AddPost', [ 'data.name' ]); // Allow moderators to execute mutation 'AddPost' and change attribute 'name'
        }
    }

    cannot('mutate', 'DeletePost'); // It is explicitly forbidden run mutation 'DeletePost', this overrides any 'can' directive

    return build();
}

const permissionCheck = async (resolve, root, args, context, info) => {
    const resourceName = info.path.key;
    const ability = defineAbilityFor(context); // Call function for defining rules
    let action = '';

    if (info.path.typename === 'Query') {
        action = 'query';
    } else if (info.path.typename === 'Mutation') {
        action = 'mutate';
    } else {
        return await resolve(root, args, context, info);
    }

    console.log({action, resourceName});

    if (ability.cannot(action, resourceName)) {
        throw new Error('Not authorized!');
    }

    if (action === 'mutate') {
        // Pick out any attributes not permitted by permissions
        args = pick(args, permittedFieldsOf(
            ability,
            action,
            subject(resourceName, args),
            { fieldsFrom: rule => rule.fields || Object.keys(args) }
        ));
        console.log({
            permittedAttributesToMutate: args
        });
    }

    // Pick out any attributes from the returned object not permitted by permissions
    // Also, this logic should be present in the resolver as well, to reduce load on the DB
    // https://casl.js.org/v5/en/advanced/ability-to-database-query
    const result = await resolve(root, args, context, info);
    if (Array.isArray(result)) {
        return result.map(item => {
            if (typeof result === 'object') {
                return pick(item, permittedFieldsOf(
                    ability,
                    'query',
                    subject(info.path.key, item),
                    {fieldsFrom: rule => rule.fields || Object.keys(item)}
                ));
            } else {
                return item;
            }
        });
    } else if (typeof result === 'object') {
        return pick(result, permittedFieldsOf(
            ability,
            'query',
            subject(info.path.key, result),
            { fieldsFrom: rule => rule.fields || Object.keys(result) }
        ));
    } else {
        return result;
    }
}

const schema = makeExecutableSchema({ typeDefs, resolvers })

const schemaWithMiddleware = applyMiddleware(schema, permissionCheck)

const server = new ApolloServer({
    schema: schemaWithMiddleware,
    context: {
        user: {
            name: 'TestUser',
            role: 'moderator'
        }
    }
})

server.listen().then(({ url }) => {
    console.log(`🚀  Server ready at ${url}`);
});