const { ApolloServer } = require('apollo-server')
const { makeExecutableSchema } = require('@graphql-tools/schema')
const { applyMiddleware } = require('graphql-middleware');
const { AbilityBuilder, Ability, subject} = require('@casl/ability');
const { pick } = require('./pick');
const { permittedFieldsOf } = require('@casl/ability/extra');
const {shield, rule, and, deny, allow, or} = require('graphql-shield');

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

const isLoggedIn = rule() (
    async (parent, args, ctx, info) => {
        return !!ctx.user;
    }
);

const isModerator = rule() (
    async (parent, args, ctx, info) => {
        return !!ctx.user && ctx.user.role === 'moderator';
    }
);

const isUnsecuredPost = rule() (
    async (parent, args, ctx, info) => {
        return [1, 4].includes(parent.user);
    }
);

const permissions = shield({
    Query: {
        ping: allow,
        GetPost: isLoggedIn,
        '*': and(isLoggedIn, isModerator)
    },
    Mutation: {
        AddPost: and(isLoggedIn, isModerator),
        DeletePost: deny
    },
    Post: {
        name: isLoggedIn,
        user: or(and(isLoggedIn, isModerator), isUnsecuredPost)
    },
}, {
    fallbackRule: deny
});

const schema = makeExecutableSchema({ typeDefs, resolvers })

const schemaWithMiddleware = applyMiddleware(schema, permissions);

const server = new ApolloServer({
    schema: schemaWithMiddleware,
    context: {
        user: {
            name: 'TestUser',
            role: 'user'
        }
    }
})

server.listen().then(({ url }) => {
    console.log(`🚀  Server ready at ${url}`);
});